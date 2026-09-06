// Table + relationship map used by the offline query engine and the sync engine.
// Mirrors the cloud database structure.

export interface ForeignKey {
  /** Column on this table */
  column: string;
  /** Table it points at */
  table: string;
  /** Column on the target table (always the primary key here) */
  targetColumn: string;
}

export interface TableDef {
  name: string;
  primaryKey: string;
  foreignKeys: ForeignKey[];
  /** Column used to order a full pull (kept stable for sync) */
  syncOrderBy?: string;
}

const fk = (column: string, table: string): ForeignKey => ({
  column,
  table,
  targetColumn: 'id',
});

export const TABLES: TableDef[] = [
  { name: 'tenants', primaryKey: 'id', foreignKeys: [] },
  {
    name: 'profiles',
    primaryKey: 'id',
    foreignKeys: [fk('tenant_id', 'tenants')],
  },
  { name: 'user_roles', primaryKey: 'id', foreignKeys: [] },
  {
    name: 'fan_series',
    primaryKey: 'id',
    foreignKeys: [fk('tenant_id', 'tenants')],
  },
  {
    name: 'fan_models',
    primaryKey: 'id',
    foreignKeys: [fk('series_id', 'fan_series'), fk('tenant_id', 'tenants')],
  },
  {
    name: 'blade_configurations',
    primaryKey: 'id',
    foreignKeys: [fk('fan_model_id', 'fan_models')],
  },
  {
    name: 'performance_data',
    primaryKey: 'id',
    foreignKeys: [fk('blade_config_id', 'blade_configurations')],
  },
  {
    name: 'noise_data',
    primaryKey: 'id',
    foreignKeys: [fk('blade_config_id', 'blade_configurations')],
  },
  {
    name: 'fan_dimensions',
    primaryKey: 'id',
    foreignKeys: [fk('series_id', 'fan_series')],
  },
  {
    name: 'series_dimension_schema',
    primaryKey: 'id',
    foreignKeys: [fk('series_id', 'fan_series')],
  },
  {
    name: 'series_dimension_values',
    primaryKey: 'id',
    foreignKeys: [fk('series_id', 'fan_series')],
  },
  {
    name: 'datasheet_config',
    primaryKey: 'id',
    foreignKeys: [fk('series_id', 'fan_series')],
  },
  {
    name: 'motor_brands',
    primaryKey: 'id',
    foreignKeys: [fk('tenant_id', 'tenants')],
  },
  {
    name: 'motor_specifications',
    primaryKey: 'id',
    foreignKeys: [
      fk('brand_id', 'motor_brands'),
      fk('series_id', 'fan_series'),
      fk('model_id', 'fan_models'),
      fk('tenant_id', 'tenants'),
    ],
  },
  {
    name: 'casing_weights',
    primaryKey: 'id',
    foreignKeys: [fk('series_id', 'fan_series'), fk('tenant_id', 'tenants')],
  },
  {
    name: 'impeller_weights',
    primaryKey: 'id',
    foreignKeys: [fk('series_id', 'fan_series'), fk('tenant_id', 'tenants')],
  },
  {
    name: 'accessory_descriptions',
    primaryKey: 'id',
    foreignKeys: [fk('tenant_id', 'tenants')],
  },
  {
    name: 'atex_rating_descriptions',
    primaryKey: 'id',
    foreignKeys: [fk('tenant_id', 'tenants')],
  },
  {
    name: 'fire_rating_descriptions',
    primaryKey: 'id',
    foreignKeys: [fk('tenant_id', 'tenants')],
  },
  {
    name: 'documentation_sections',
    primaryKey: 'id',
    foreignKeys: [fk('tenant_id', 'tenants')],
  },
  {
    name: 'page_content',
    primaryKey: 'id',
    foreignKeys: [fk('tenant_id', 'tenants')],
  },
  {
    name: 'unit_preferences',
    primaryKey: 'id',
    foreignKeys: [fk('tenant_id', 'tenants')],
  },
  {
    name: 'air_curtain_brands',
    primaryKey: 'id',
    foreignKeys: [fk('tenant_id', 'tenants')],
  },
  {
    name: 'air_curtain_series',
    primaryKey: 'id',
    foreignKeys: [fk('brand_id', 'air_curtain_brands'), fk('tenant_id', 'tenants')],
  },
  {
    name: 'air_curtain_models',
    primaryKey: 'id',
    foreignKeys: [
      fk('series_id', 'air_curtain_series'),
      fk('brand_id', 'air_curtain_brands'),
      fk('tenant_id', 'tenants'),
    ],
  },
  {
    name: 'air_curtain_dimensions',
    primaryKey: 'id',
    foreignKeys: [
      fk('series_id', 'air_curtain_series'),
      fk('model_id', 'air_curtain_models'),
      fk('tenant_id', 'tenants'),
    ],
  },
  {
    name: 'projects',
    primaryKey: 'id',
    foreignKeys: [fk('tenant_id', 'tenants')],
  },
  {
    name: 'project_items',
    primaryKey: 'id',
    foreignKeys: [
      fk('project_id', 'projects'),
      fk('series_id', 'fan_series'),
      fk('fan_model_id', 'fan_models'),
      fk('tenant_id', 'tenants'),
    ],
  },
];

export const TABLE_NAMES = TABLES.map((t) => t.name);

export const TABLE_MAP: Record<string, TableDef> = Object.fromEntries(
  TABLES.map((t) => [t.name, t]),
);

/** Tables that hold user-owned data and must be pushed back to the cloud on sync. */
export const WRITABLE_TABLES = new Set(TABLE_NAMES);

/**
 * Find how `relation` connects to `table`.
 * - 'many': relation rows point at this table (embedded as an array)
 * - 'one':  this table has a column pointing at the relation (embedded as an object)
 */
export function resolveRelation(
  table: string,
  relation: string,
): { kind: 'one' | 'many'; localColumn: string; foreignColumn: string } | null {
  const def = TABLE_MAP[table];
  const relDef = TABLE_MAP[relation];
  if (!def || !relDef) return null;

  const outgoing = def.foreignKeys.find((f) => f.table === relation);
  if (outgoing) {
    return { kind: 'one', localColumn: outgoing.column, foreignColumn: outgoing.targetColumn };
  }

  const incoming = relDef.foreignKeys.find((f) => f.table === table);
  if (incoming) {
    return { kind: 'many', localColumn: def.primaryKey, foreignColumn: incoming.column };
  }

  return null;
}
