# Air Curtain Backend + Multi-Unit Selection + PDF Datasheet

Bring air curtains to the same level as fans: full admin data management, brand/series hierarchy, drawings and dimensions, smarter multi-model selection, and a branded PDF datasheet.

## 1. Data structure (backend)

Mirror the fan hierarchy: **Brand → Series → Model → Data**.

- `air_curtain_brands` — name, logo, website, notes.
- `air_curtain_series` — belongs to a brand; name, description, mounting type (wall / ceiling recessed), motor type (AC / EC), photo, drawing, catalogue link, datasheet description.
- `air_curtain_models` (existing table, extended) — linked to a series; keeps all catalogue data (length, power, nozzle velocity, airflow high/low, noise, weights, mounting height band) plus per-model drawing image.
- `air_curtain_dimensions` — flexible size table per series (label/value pairs like A, B, C, H, W, D) so each brand's drawing table can differ.

Access rules: everyone signed in can read; admins of the tenant can add, edit and delete. Existing seeded KINAIR models get attached to a "KINAIR" brand and default series automatically so nothing is lost.

## 2. Admin screens

New **Air Curtains** section in the admin sidebar with sub-tabs:

- **Brands** — add/edit brand, upload brand logo (used on datasheets), list series count.
- **Series** — per brand: name, mounting type, motor type, photo and drawing upload, description shown on datasheet.
- **Models** — per series: table editor for all catalogue values (length, nozzle velocity, airflow CMH/CFM high & low, power, noise, weights, mounting height range, remarks) with decimal-safe inputs; Excel import/export like the fan editors.
- **Dimensions** — per series: define the dimension parameter list, then enter values per model size.

Uploads go to a storage bucket for air curtain assets (logos, photos, drawings).

## 3. Selection optimisation (mixed-length combinations)

Replace the "N × same model" logic with a combination solver:

- Considers all models within the filtered brand / series / mounting / motor type set.
- Finds the best mix of up to 4 units (e.g. 2.5 m door → 1.0 m + 1.5 m) that covers the opening.
- Scoring: full coverage first, then least overhang, fewest units, lowest total power, then nozzle velocity margin over the requirement.
- Results table shows the combination ("1 × FM-1509 + 1 × FM-1512 = 2500 mm"), total airflow, total power, worst-case noise and floor velocity.
- Existing filters (nozzle velocity, airflow, motor type, brand, floor velocity) all apply to the combination.

## 4. Air curtain PDF datasheet

New generator, styled like the fan datasheet but air-curtain specific:

- Header with brand logo (from the brand record) and unit model / combination.
- Duty summary: door size, mounting height, mounting type, motor type, units and lengths.
- Technical table: nozzle velocity, airflow (m³/h and CFM) high/low, input power, noise, weights, IP/voltage remarks.
- Velocity projection chart (vector-drawn, same technique as the fan curves).
- Dimension drawing image plus the series dimension table.
- Notes / catalogue reference footer.
- "Download Datasheet" button on the selection detail panel.

## 5. Offline support

Register the new tables and bucket in the desktop sync schema so brands, series, models, dimensions and drawings ship offline like fan data.

## Technical notes

- New tables in the `public` schema with grants + row-level security scoped by tenant, matching the fan tables.
- Combination solver lives in `src/lib/airCurtainData.ts`; PDF in a new `src/lib/airCurtainDatasheet.ts` using jsPDF vector drawing (no html2canvas).
- Admin components under `src/components/admin/aircurtain/`.
