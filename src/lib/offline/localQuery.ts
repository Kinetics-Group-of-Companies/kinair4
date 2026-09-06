/**
 * A tiny PostgREST-compatible query engine that runs against the local
 * IndexedDB mirror. It supports the subset of the Supabase JS client API this
 * app actually uses: filtered selects with embedded relations, insert, update,
 * upsert, delete, ordering, limits and single/maybeSingle.
 */
import { localDb } from './localDb';
import { TABLE_MAP, resolveRelation } from './schema';
import { queueMutation } from './outbox';

type Row = Record<string, any>;

export interface LocalResult<T> {
  data: T;
  error: { message: string; code?: string } | null;
  count?: number | null;
  status: number;
}

type FilterOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'ilike'
  | 'in'
  | 'is'
  | 'contains'
  | 'overlaps';

interface Filter {
  op: FilterOp;
  column: string;
  value: any;
  negate?: boolean;
}

interface SelectField {
  alias: string;
  name: string;
  inner: boolean;
  children: SelectField[] | null;
}

/* ------------------------------------------------------------------ */
/* select() parsing                                                    */
/* ------------------------------------------------------------------ */

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of input) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function parseSelect(select: string): SelectField[] {
  const cleaned = select.replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned === '*') return [{ alias: '*', name: '*', inner: false, children: null }];

  return splitTopLevel(cleaned).map((part) => {
    let expr = part.trim();
    let alias: string | null = null;

    const aliasSplit = expr.indexOf(':');
    const parenIndex = expr.indexOf('(');
    if (aliasSplit > -1 && (parenIndex === -1 || aliasSplit < parenIndex)) {
      alias = expr.slice(0, aliasSplit).trim();
      expr = expr.slice(aliasSplit + 1).trim();
    }

    const open = expr.indexOf('(');
    if (open === -1) {
      const name = expr.replace('!inner', '').trim();
      return { alias: alias ?? name, name, inner: false, children: null };
    }

    const close = expr.lastIndexOf(')');
    let name = expr.slice(0, open).trim();
    const inner = name.includes('!inner');
    name = name.replace('!inner', '').replace(/!.*$/, '').trim();
    const children = parseSelect(expr.slice(open + 1, close));
    return { alias: alias ?? name, name, inner, children };
  });
}

/* ------------------------------------------------------------------ */
/* filtering                                                           */
/* ------------------------------------------------------------------ */

function matches(row: Row, filter: Filter): boolean {
  const value = row[filter.column];
  let result: boolean;

  switch (filter.op) {
    case 'eq':
      result = looseEqual(value, filter.value);
      break;
    case 'neq':
      result = !looseEqual(value, filter.value);
      break;
    case 'gt':
      result = value > filter.value;
      break;
    case 'gte':
      result = value >= filter.value;
      break;
    case 'lt':
      result = value < filter.value;
      break;
    case 'lte':
      result = value <= filter.value;
      break;
    case 'in':
      result = Array.isArray(filter.value) && filter.value.some((v) => looseEqual(value, v));
      break;
    case 'is':
      result = filter.value === null ? value === null || value === undefined : value === filter.value;
      break;
    case 'like':
    case 'ilike': {
      const pattern = String(filter.value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
      const regex = new RegExp(`^${pattern}$`, filter.op === 'ilike' ? 'i' : '');
      result = regex.test(String(value ?? ''));
      break;
    }
    case 'contains':
      result =
        Array.isArray(value) &&
        (Array.isArray(filter.value) ? filter.value : [filter.value]).every((v) => value.includes(v));
      break;
    case 'overlaps':
      result =
        Array.isArray(value) &&
        (Array.isArray(filter.value) ? filter.value : [filter.value]).some((v) => value.includes(v));
      break;
    default:
      result = true;
  }

  return filter.negate ? !result : result;
}

function looseEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return String(a) === String(b);
}

/* ------------------------------------------------------------------ */
/* projection (embedded relations)                                     */
/* ------------------------------------------------------------------ */

async function project(table: string, rows: Row[], fields: SelectField[]): Promise<Row[]> {
  if (fields.length === 1 && fields[0].name === '*' && !fields[0].children) return rows;

  const output: Row[] = [];

  for (const row of rows) {
    const result: Row = {};
    let dropped = false;

    for (const field of fields) {
      if (field.name === '*') {
        Object.assign(result, row);
        continue;
      }

      if (!field.children) {
        result[field.alias] = row[field.name] ?? null;
        continue;
      }

      const relation = resolveRelation(table, field.name);
      if (!relation) {
        result[field.alias] = field.inner ? null : [];
        continue;
      }

      const related = await localDb.rows<Row>(field.name).toArray();

      if (relation.kind === 'one') {
        const match = related.find((r) => looseEqual(r[relation.foreignColumn], row[relation.localColumn]));
        if (!match && field.inner) {
          dropped = true;
          break;
        }
        result[field.alias] = match ? (await project(field.name, [match], field.children))[0] : null;
      } else {
        const children = related.filter((r) => looseEqual(r[relation.foreignColumn], row[relation.localColumn]));
        if (children.length === 0 && field.inner) {
          dropped = true;
          break;
        }
        result[field.alias] = await project(field.name, children, field.children);
      }
    }

    if (!dropped) output.push(result);
  }

  return output;
}

/* ------------------------------------------------------------------ */
/* query builder                                                       */
/* ------------------------------------------------------------------ */

type Mode = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

export class LocalQueryBuilder<T = any> implements PromiseLike<LocalResult<T>> {
  private filters: Filter[] = [];
  private selectFields: SelectField[] | null = null;
  private orderBy: { column: string; ascending: boolean }[] = [];
  private limitCount: number | null = null;
  private rangeBounds: [number, number] | null = null;
  private mode: Mode = 'select';
  private payload: Row[] = [];
  private singleMode: 'single' | 'maybeSingle' | null = null;
  private wantsReturning = false;
  private wantsCount = false;

  constructor(private table: string) {}

  /* --- filters --- */
  private addFilter(op: FilterOp, column: string, value: any, negate = false) {
    this.filters.push({ op, column, value, negate });
    return this;
  }

  eq(column: string, value: any) {
    return this.addFilter('eq', column, value);
  }
  neq(column: string, value: any) {
    return this.addFilter('neq', column, value);
  }
  gt(column: string, value: any) {
    return this.addFilter('gt', column, value);
  }
  gte(column: string, value: any) {
    return this.addFilter('gte', column, value);
  }
  lt(column: string, value: any) {
    return this.addFilter('lt', column, value);
  }
  lte(column: string, value: any) {
    return this.addFilter('lte', column, value);
  }
  like(column: string, value: string) {
    return this.addFilter('like', column, value);
  }
  ilike(column: string, value: string) {
    return this.addFilter('ilike', column, value);
  }
  in(column: string, values: any[]) {
    return this.addFilter('in', column, values);
  }
  is(column: string, value: any) {
    return this.addFilter('is', column, value);
  }
  contains(column: string, value: any) {
    return this.addFilter('contains', column, value);
  }
  overlaps(column: string, value: any) {
    return this.addFilter('overlaps', column, value);
  }
  not(column: string, op: string, value: any) {
    return this.addFilter((op as FilterOp) ?? 'eq', column, value, true);
  }
  or(_expression: string) {
    // Unsupported offline; returns the unfiltered set rather than failing.
    return this;
  }
  filter(column: string, op: string, value: any) {
    return this.addFilter((op as FilterOp) ?? 'eq', column, value);
  }
  match(criteria: Row) {
    Object.entries(criteria).forEach(([k, v]) => this.addFilter('eq', k, v));
    return this;
  }

  /* --- shaping --- */
  select(columns = '*', options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
    this.selectFields = parseSelect(columns);
    this.wantsReturning = true;
    if (options?.count) this.wantsCount = true;
    return this;
  }
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orderBy.push({ column, ascending: options?.ascending !== false });
    return this;
  }
  limit(count: number) {
    this.limitCount = count;
    return this;
  }
  range(from: number, to: number) {
    this.rangeBounds = [from, to];
    return this;
  }
  single() {
    this.singleMode = 'single';
    return this as unknown as LocalQueryBuilder<T>;
  }
  maybeSingle() {
    this.singleMode = 'maybeSingle';
    return this as unknown as LocalQueryBuilder<T>;
  }
  throwOnError() {
    return this;
  }
  abortSignal() {
    return this;
  }

  /* --- mutations --- */
  insert(values: Row | Row[]) {
    this.mode = 'insert';
    this.payload = Array.isArray(values) ? values : [values];
    return this;
  }
  upsert(values: Row | Row[], _options?: { onConflict?: string }) {
    this.mode = 'upsert';
    this.payload = Array.isArray(values) ? values : [values];
    (this as any).onConflict = _options?.onConflict;
    return this;
  }
  update(values: Row) {
    this.mode = 'update';
    this.payload = [values];
    return this;
  }
  delete() {
    this.mode = 'delete';
    return this;
  }

  /* --- execution --- */
  private async readMatching(): Promise<Row[]> {
    const all = await localDb.rows<Row>(this.table).toArray();

    // Filters written against an embedded relation (`fan_series.tenant_id`)
    // must be resolved through the foreign key, not looked up on the row.
    const plain = this.filters.filter((f) => !f.column.includes('.'));
    const embedded = this.filters.filter((f) => f.column.includes('.'));

    let rows = all.filter((row) => plain.every((f) => matches(row, f)));

    for (const filter of embedded) {
      const [relationName, ...rest] = filter.column.split('.');
      const relation = resolveRelation(this.table, relationName);
      if (!relation) continue; // unknown relation offline — don't drop everything
      const related = await localDb.rows<Row>(relationName).toArray();
      const subFilter: Filter = { ...filter, column: rest.join('.') };
      rows = rows.filter((row) => {
        const linked = related.filter((r) => looseEqual(r[relation.foreignColumn], row[relation.localColumn]));
        return linked.some((r) => matches(r, subFilter));
      });
    }

    return rows;
  }



  private sortAndSlice(rows: Row[]): Row[] {
    let output = [...rows];
    for (const { column, ascending } of [...this.orderBy].reverse()) {
      output.sort((a, b) => {
        const av = a[column];
        const bv = b[column];
        if (av === bv) return 0;
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
        return ascending ? cmp : -cmp;
      });
    }
    if (this.rangeBounds) output = output.slice(this.rangeBounds[0], this.rangeBounds[1] + 1);
    if (this.limitCount !== null) output = output.slice(0, this.limitCount);
    return output;
  }

  private stamp(row: Row, isNew: boolean): Row {
    const def = TABLE_MAP[this.table];
    const now = new Date().toISOString();
    const next: Row = { ...row };
    if (isNew && def && !next[def.primaryKey]) next[def.primaryKey] = crypto.randomUUID();
    if (isNew && next.created_at === undefined) next.created_at = now;
    next.updated_at = now;
    return next;
  }

  private async run(): Promise<LocalResult<any>> {
    const def = TABLE_MAP[this.table];
    if (!def) {
      return { data: null, error: { message: `Unknown table "${this.table}" in offline mode` }, status: 400 };
    }
    const store = localDb.rows<Row>(this.table);
    const pk = def.primaryKey;

    try {
      let affected: Row[] = [];

      if (this.mode === 'select') {
        affected = this.sortAndSlice(await this.readMatching());
      }

      if (this.mode === 'insert') {
        affected = this.payload.map((row) => this.stamp(row, true));
        await store.bulkPut(affected as any);
        for (const row of affected) await queueMutation(this.table, 'insert', row[pk], row);
      }

      if (this.mode === 'upsert') {
        const existing = await store.toArray();
        const conflictKey = ((this as any).onConflict as string | undefined)?.split(',')[0]?.trim();
        affected = [];
        for (const raw of this.payload) {
          let previous: Row | undefined;
          if (raw[pk]) previous = existing.find((r) => looseEqual(r[pk], raw[pk]));
          if (!previous && conflictKey) {
            previous = existing.find((r) => looseEqual(r[conflictKey], raw[conflictKey]));
          }
          const merged = previous
            ? this.stamp({ ...previous, ...raw }, false)
            : this.stamp(raw, true);
          affected.push(merged);
        }
        await store.bulkPut(affected as any);
        for (const row of affected) await queueMutation(this.table, 'upsert', row[pk], row);
      }

      if (this.mode === 'update') {
        const targets = await this.readMatching();
        affected = targets.map((row) => this.stamp({ ...row, ...this.payload[0] }, false));
        await store.bulkPut(affected as any);
        for (const row of affected) await queueMutation(this.table, 'update', row[pk], row);
      }

      if (this.mode === 'delete') {
        const targets = await this.readMatching();
        await store.bulkDelete(targets.map((r) => r[pk]));
        for (const row of targets) await queueMutation(this.table, 'delete', row[pk], null);
        affected = targets;
      }

      const count = this.wantsCount ? affected.length : undefined;

      if (this.mode !== 'select' && !this.wantsReturning) {
        return { data: null, error: null, count, status: 204 };
      }

      const fields = this.selectFields ?? parseSelect('*');
      const projected = await project(this.table, affected, fields);

      if (this.singleMode) {
        if (projected.length === 0) {
          if (this.singleMode === 'maybeSingle') return { data: null, error: null, count, status: 200 };
          return {
            data: null,
            error: { message: 'No rows found', code: 'PGRST116' },
            count,
            status: 406,
          };
        }
        return { data: projected[0], error: null, count, status: 200 };
      }

      return { data: projected, error: null, count, status: 200 };
    } catch (error) {
      return {
        data: null,
        error: { message: error instanceof Error ? error.message : 'Offline query failed' },
        status: 500,
      };
    }
  }

  then<R1 = LocalResult<T>, R2 = never>(
    onfulfilled?: ((value: LocalResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled as any, onrejected);
  }
}
