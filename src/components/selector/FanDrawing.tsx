import { useMemo } from 'react';
import { useSupabaseFanDatabase } from '@/hooks/useSupabaseFanDatabase';
import { useFanDimensions } from '@/hooks/useFanDatabase';
import { useDimensionSchema, useDimensionValues } from '@/hooks/useFlexibleDimensions';
import fanDrawingImg from '@/assets/fan-technical-drawing.png';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface FanDrawingProps {
  diameter: number;
  series?: string; // This is the series NAME (e.g., "KTAF"), not the ID
}

export function FanDrawing({ diameter, series }: FanDrawingProps) {
  const { database } = useSupabaseFanDatabase();
  
  // Find the series info by name to get its ID and drawing URL
  const seriesInfo = useMemo(() => {
    if (series) {
      // First check if series is a name, look it up in database.series
      const foundSeries = database.series.find(s => s.name === series);
      if (foundSeries) {
        const seriesDrawing = database.seriesDrawings.find(sd => sd.seriesId === foundSeries.id);
        return {
          id: foundSeries.id,
          name: foundSeries.name,
          drawingUrl: seriesDrawing?.drawingUrl || '',
        };
      }
    }
    return null;
  }, [series, database.series, database.seriesDrawings]);

  // Use series ID for legacy dimensions lookup
  const { data: legacyDimensionsData = [] } = useFanDimensions(seriesInfo?.id || null);
  
  // Use flexible dimensions (new system)
  const { data: flexSchema = [] } = useDimensionSchema(seriesInfo?.id || null);
  const { data: flexValues = [] } = useDimensionValues(seriesInfo?.id || null);

  // Check if flexible dimensions exist for this size
  const flexDimensions = useMemo(() => {
    return flexValues.find(v => v.size === diameter);
  }, [flexValues, diameter]);

  // Check if legacy dimensions exist for this size
  const legacyDimensions = useMemo(() => {
    return legacyDimensionsData.find(d => d.size === diameter);
  }, [legacyDimensionsData, diameter]);

  // Sort schema by display order
  const sortedSchema = useMemo(() => {
    return [...flexSchema].sort((a, b) => a.display_order - b.display_order);
  }, [flexSchema]);

  // Determine if we have flexible dimensions with actual values
  const hasFlexDimensions = flexDimensions && sortedSchema.length > 0 && 
    Object.values(flexDimensions.values || {}).some(v => v !== '' && v !== null && v !== undefined);

  // Determine if we have valid legacy dimensions (not all zeros)
  const hasLegacyDimensions = legacyDimensions && (
    legacyDimensions.phiD2 > 0 || legacyDimensions.phiD1 > 0 || legacyDimensions.phiD > 0 ||
    legacyDimensions.H > 0 || legacyDimensions.E > 0 || legacyDimensions.F > 0 ||
    legacyDimensions.L > 0 || legacyDimensions.K > 0
  );

  // Use custom drawing from series or fallback to default
  const drawingImage = seriesInfo?.drawingUrl || fanDrawingImg;

  // If no dimensions available at all
  if (!hasFlexDimensions && !hasLegacyDimensions) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>Dimensions not available for Ø{diameter}mm{series ? ` (${series})` : ''}</p>
        <p className="text-xs mt-1">Please configure dimensions in the Admin Portal.</p>
      </div>
    );
  }

  // Render flexible dimensions if available
  if (hasFlexDimensions) {
    return (
      <div className="space-y-4">
        {/* Drawing Image */}
        <div className="bg-white rounded-lg p-6 border">
          <img 
            src={drawingImage} 
            alt={`Fan Drawing Ø${diameter}mm`}
            className="w-full max-w-2xl mx-auto"
          />
        </div>

        {/* Flexible Dimension Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-center">Size</TableHead>
                {sortedSchema.map(param => (
                  <TableHead key={param.id} className="text-center">{param.param_label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="bg-primary/5">
                <TableCell className="text-center font-bold text-primary">{diameter}</TableCell>
                {sortedSchema.map(param => (
                  <TableCell key={param.id} className="text-center font-mono">
                    {flexDimensions.values[param.param_key] ?? '-'}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          All dimensions in mm
        </p>
      </div>
    );
  }

  // Render legacy dimensions
  return (
    <div className="space-y-4">
      {/* Drawing Image */}
      <div className="bg-white rounded-lg p-6 border">
        <img 
          src={drawingImage} 
          alt={`Fan Drawing Ø${diameter}mm`}
          className="w-full max-w-2xl mx-auto"
        />
      </div>

      {/* Legacy Dimension Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-center">Size</TableHead>
              <TableHead className="text-center">ΦD2</TableHead>
              <TableHead className="text-center">ΦD1</TableHead>
              <TableHead className="text-center">ΦD</TableHead>
              <TableHead className="text-center">H</TableHead>
              <TableHead className="text-center">E</TableHead>
              <TableHead className="text-center">F</TableHead>
              <TableHead className="text-center">L</TableHead>
              <TableHead className="text-center">K</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-primary/5">
              <TableCell className="text-center font-bold text-primary">{legacyDimensions!.size}</TableCell>
              <TableCell className="text-center font-mono">{legacyDimensions!.phiD2}</TableCell>
              <TableCell className="text-center font-mono">{legacyDimensions!.phiD1}</TableCell>
              <TableCell className="text-center font-mono">{legacyDimensions!.phiD}</TableCell>
              <TableCell className="text-center font-mono">{legacyDimensions!.H}</TableCell>
              <TableCell className="text-center font-mono">{legacyDimensions!.E}</TableCell>
              <TableCell className="text-center font-mono">{legacyDimensions!.F}</TableCell>
              <TableCell className="text-center font-mono">{legacyDimensions!.L}</TableCell>
              <TableCell className="text-center font-mono">{legacyDimensions!.K}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* Additional Details */}
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <div className="text-xs text-muted-foreground">Bolt Pattern</div>
          <div className="font-mono font-medium">{legacyDimensions!.nPhiD}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <div className="text-xs text-muted-foreground">Mounting Holes</div>
          <div className="font-mono font-medium">{legacyDimensions!.zPhiD1}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <div className="text-xs text-muted-foreground">Motor Frame Max</div>
          <div className="font-mono font-medium">{legacyDimensions!.motorMax}</div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        All dimensions in mm
      </p>
    </div>
  );
}
