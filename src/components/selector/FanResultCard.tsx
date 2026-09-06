import { Wind, Zap, Gauge, Volume2, Check, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FanSelection, AIRFLOW_UNITS, PRESSURE_UNITS, formatAirflow, formatPressure } from '@/lib/fanData';
import { formatPower } from '@/lib/utils';

interface FanResultCardProps {
  selection: FanSelection;
  rank: number;
  airflowUnit: keyof typeof AIRFLOW_UNITS;
  pressureUnit: keyof typeof PRESSURE_UNITS;
  onSelect: () => void;
  isSelected?: boolean;
}

export function FanResultCard({ 
  selection, 
  rank, 
  airflowUnit, 
  pressureUnit,
  onSelect,
  isSelected 
}: FanResultCardProps) {
  const displayAirflow = formatAirflow(selection.operatingPoint.airflow, 'CMH', airflowUnit);
  const displayPressure = formatPressure(selection.operatingPoint.staticPressure, 'Pa', pressureUnit);
  
  const matchColor = selection.dutyPointMatch >= 95 
    ? 'text-emerald-600' 
    : selection.dutyPointMatch >= 85 
      ? 'text-amber-600' 
      : 'text-orange-600';

  return (
    <div 
      className={`kinair-card p-6 cursor-pointer transition-all duration-200 hover:shadow-kinair-lg ${
        isSelected ? 'ring-2 ring-primary bg-primary/5' : ''
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-6">
        {/* Rank Badge */}
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${
            rank === 1 
              ? 'bg-gradient-accent text-accent-foreground' 
              : 'bg-secondary text-secondary-foreground'
          }`}>
            {rank}
          </div>
          
          <div>
            <h3 className="text-xl font-bold text-foreground">
              {selection.nomenclature || `KAF-${selection.diameter}`}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {selection.bladeCount > 0 
                ? `${selection.bladeCount} Blades · ${selection.bladeAngle}° · ${selection.motorPole}P`
                : `${selection.motorPole}P Motor`
              }
            </p>
          </div>
        </div>

        {/* Match Indicator */}
        <div className="text-right">
          <div className={`text-3xl font-bold font-mono ${matchColor}`}>
            {Math.round(selection.dutyPointMatch)}%
          </div>
          <div className="text-sm text-muted-foreground font-medium">Match</div>
        </div>
      </div>

      {/* Performance Stats */}
      <div className="grid grid-cols-4 gap-4 mt-6">
        <div className="kinair-stat p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Wind className="w-4 h-4" />
            Airflow
          </div>
          <div className="text-lg font-mono font-bold text-foreground">
            {displayAirflow}
          </div>
          <div className="text-xs text-muted-foreground mt-1">{AIRFLOW_UNITS[airflowUnit].label}</div>
        </div>
        
        <div className="kinair-stat p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Gauge className="w-4 h-4" />
            Pressure
          </div>
          <div className="text-lg font-mono font-bold text-foreground">
            {displayPressure}
          </div>
          <div className="text-xs text-muted-foreground mt-1">{PRESSURE_UNITS[pressureUnit].label}</div>
        </div>
        
        <div className="kinair-stat p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Zap className="w-4 h-4" />
            Power
          </div>
          <div className="text-lg font-mono font-bold text-foreground">
            {formatPower(selection.operatingPoint.shaftPower)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">kW</div>
        </div>
        
        <div className="kinair-stat p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Volume2 className="w-4 h-4" />
            Noise
          </div>
          <div className="text-lg font-mono font-bold text-foreground">
            {selection.noiseData.overall}
          </div>
          <div className="text-xs text-muted-foreground mt-1">dB(A)</div>
        </div>
      </div>

      {/* Efficiency Bar */}
      <div className="mt-5">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-muted-foreground font-medium">Efficiency</span>
          <span className="font-mono font-bold text-primary text-lg">{selection.operatingPoint.efficiency}%</span>
        </div>
        <div className="h-3 bg-secondary rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-primary to-kinair-blue-light rounded-full transition-all duration-500"
            style={{ width: `${selection.operatingPoint.efficiency}%` }}
          />
        </div>
      </div>

      {/* Select Button */}
      <div className="mt-5 flex justify-end">
        <Button 
          variant={isSelected ? "kinair" : "kinair-outline"} 
          size="default"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        >
          {isSelected ? (
            <>
              <Check className="w-5 h-5" />
              Selected
            </>
          ) : (
            <>
              View Details
              <ChevronRight className="w-5 h-5" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
