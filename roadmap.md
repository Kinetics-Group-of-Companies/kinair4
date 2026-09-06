- [x] Stream chart: don't cut stream at requested height; show full range + duty point marker (UI + PDF)
- [x] PDF stream chart: fix reach-label overlap with axis ticks
- [x] Stream chart: show velocity at duty point
- [x] Stream chart: clamp stream reach to series max installation height
- [x] Air curtain Excel import/export tab
- [x] Product photo on air curtain datasheet
- [x] Remove "<=" / "≤" from air curtain noise displays

## Air curtain — voltage/frequency (Aug 31)
- [x] Add voltage + rated frequency to air curtain models (admin + import/export)
- [x] Fan-law selection at a different supply frequency (50/60 Hz)
- [x] Show Voltage/Frequency in datasheet + selector
- [x] Datasheet Dimensions (mm) column sequence L, W, H
- [x] Shade velocity profile chart with an air-tone gradient fill

## Stream chart fixes (Aug 31)
- [x] Remove small drifting air particles from stream range chart (website + PDF), keep shading
- [x] Match website stream wave motion to datasheet PDF (straight at nozzle, sway grows with depth)
- [x] Add dotted airflow pulse line along PDF datasheet stream strands (match website)
- [x] Stream range chart: align horizontal grid lines with y-axis values (website + PDF)

## LPO / Delivery Tracker
- [x] Database: lpo_orders, lpo_order_updates, lpo_alert_log
- [x] /tracker page: new order punch-in, filters, timeline, follow-up log, delay health
- [x] Email automation: notify.kinair.ae sender, daily delay alerts (at-risk + overdue), Monday weekly summary
- [x] Saved customer/supplier address book (searchable, auto-filled on new orders)
- [x] Document uploads per order (client LPO, supplier PO, quotation, PI, ack, invoice, etc.)
- [x] Terms: payment terms (customer + supplier), warranty terms/period, delivery terms, retention
- [x] VAT % + amount, total incl. VAT, advance/balance amounts both sides, PI sent + order ack dates
- [x] Auto-purge of delivered orders older than 2 years (monthly job)

## AI schedule PDF
- [x] Show only the latest schedule selection result
- [x] Download all selected fans as one PDF with a branded cover page
