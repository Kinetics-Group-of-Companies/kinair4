# Fix family-curve selection and visibility

## Changes
- Make a curve click update blade angle and duty point atomically, preventing the old angle’s data from overwriting the newly selected point.
- Use the revised blade angle and operating point consistently in PDF, Excel, and project datasheet generation.
- Add per-angle show/hide controls beside the family-curve controls; apply the same visible-angle set to pressure, power, efficiency, and exported family curves.
- Avoid drawing a duplicate main curve while family-curve mode is active.

## Technical details
- Separate all available family curves from the filtered visible curves in `FanDetailsPanel`.
- Route cross-angle clicks exclusively through `onAngleSelect(angle, point)`; use `onDutyPointChange` only when staying on the current angle.
- Pass family data, selected angle, diameter, and density to all three performance charts.
- Preserve the selected blade angle even when its curve is temporarily hidden.

## Validation
- Verify selecting a different curve updates the visible angle and duty point.
- Verify PDF/Excel export inputs use the revised angle and point.
- Verify each angle can be hidden and restored without changing stored fan data.
