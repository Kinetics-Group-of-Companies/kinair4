import { useState, useMemo } from 'react';
import { Filter, ArrowUpDown, ChevronDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FanSelection, AIRFLOW_UNITS, PRESSURE_UNITS, formatAirflow as fmtAirflow, formatPressure as fmtPressure, generateDynamicDescription } from '@/lib/fanData';
import { formatPower } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface FanResultsTableProps {
  selections: FanSelection[];
  airflowUnit: keyof typeof AIRFLOW_UNITS;
  pressureUnit: keyof typeof PRESSURE_UNITS;
  onSelect: (selection: FanSelection) => void;
  selectedFan: FanSelection | null;
}

type SortField = 'diameter' | 'bladeCount' | 'bladeAngle' | 'motorRating' | 'efficiency' | 'dutyPointMatch' | 'airflow' | 'pressure' | 'score';
type SortDirection = 'asc' | 'desc';

export function FanResultsTable({ 
  selections, 
  airflowUnit, 
  pressureUnit, 
  onSelect,
  selectedFan 
}: FanResultsTableProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDiameter, setFilterDiameter] = useState<string>('all');
  const [filterBladeCount, setFilterBladeCount] = useState<string>('all');
  const [filterBladeAngle, setFilterBladeAngle] = useState<string>('all');
  const [filterMotorPole, setFilterMotorPole] = useState<string>('all');
  const [filterSeries, setFilterSeries] = useState<string>('all');
  // Default sort by optimization score (lower is better - closest to 100% duty point, smallest diameter, lowest motor)
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Get unique values for filters
  const uniqueDiameters = useMemo(() => 
    [...new Set(selections.map(s => s.diameter))].sort((a, b) => a - b),
    [selections]
  );
  const uniqueBladeCountsFromSelections = useMemo(() => 
    [...new Set(selections.map(s => s.bladeCount))].sort((a, b) => a - b),
    [selections]
  );
  const uniqueBladeAnglesFromSelections = useMemo(() => 
    [...new Set(selections.map(s => s.bladeAngle))].sort((a, b) => a - b),
    [selections]
  );
  const uniqueMotorPoles = useMemo(() => 
    [...new Set(selections.map(s => s.motorPole))].sort((a, b) => a - b),
    [selections]
  );
  const uniqueSeries = useMemo(() => 
    [...new Set(selections.map(s => s.series))],
    [selections]
  );

  // Filter and sort selections
  const filteredSelections = useMemo(() => {
    let filtered = selections.filter(s => {
      if (searchTerm && !s.nomenclature.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      if (filterDiameter !== 'all' && s.diameter !== parseInt(filterDiameter)) {
        return false;
      }
      if (filterBladeCount !== 'all' && s.bladeCount !== parseInt(filterBladeCount)) {
        return false;
      }
      if (filterBladeAngle !== 'all' && s.bladeAngle !== parseInt(filterBladeAngle)) {
        return false;
      }
      if (filterMotorPole !== 'all' && s.motorPole !== parseInt(filterMotorPole)) {
        return false;
      }
      if (filterSeries !== 'all' && s.series !== filterSeries) {
        return false;
      }
      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      let aVal: number, bVal: number;
      switch (sortField) {
        case 'diameter':
          aVal = a.diameter;
          bVal = b.diameter;
          break;
        case 'bladeCount':
          aVal = a.bladeCount;
          bVal = b.bladeCount;
          break;
        case 'bladeAngle':
          aVal = a.bladeAngle;
          bVal = b.bladeAngle;
          break;
        case 'motorRating':
          aVal = a.motorRating;
          bVal = b.motorRating;
          break;
        case 'efficiency':
          aVal = a.operatingPoint.efficiency;
          bVal = b.operatingPoint.efficiency;
          break;
        case 'airflow':
          aVal = a.operatingPoint.airflow;
          bVal = b.operatingPoint.airflow;
          break;
        case 'pressure':
          aVal = a.operatingPoint.staticPressure;
          bVal = b.operatingPoint.staticPressure;
          break;
        case 'dutyPointMatch':
          aVal = a.dutyPointMatch;
          bVal = b.dutyPointMatch;
          break;
        case 'score':
        default:
          aVal = a.score;
          bVal = b.score;
      }
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return filtered;
  }, [selections, searchTerm, filterDiameter, filterBladeCount, filterBladeAngle, filterMotorPole, filterSeries, sortField, sortDirection]);

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterDiameter !== 'all') count++;
    if (filterBladeCount !== 'all') count++;
    if (filterBladeAngle !== 'all') count++;
    if (filterMotorPole !== 'all') count++;
    if (filterSeries !== 'all') count++;
    return count;
  }, [filterDiameter, filterBladeCount, filterBladeAngle, filterMotorPole, filterSeries]);
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const isSelected = (selection: FanSelection) => {
    return selectedFan?.fanId === selection.fanId && 
           selectedFan?.bladeCount === selection.bladeCount &&
           selectedFan?.bladeAngle === selection.bladeAngle;
  };

  const getMatchColor = (match: number) => {
    if (match >= 95) return 'text-emerald-600';
    if (match >= 85) return 'text-amber-600';
    return 'text-orange-600';
  };

  const formatAirflow = (value: number) => {
    return fmtAirflow(value, 'CMH', airflowUnit);
  };

  const formatPressure = (value: number) => {
    return fmtPressure(value, 'Pa', pressureUnit);
  };

  return (
    <div className="space-y-4">
      {/* Search and Filter Controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Search by model..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-11 text-base"
          />
        </div>
        <Collapsible open={filterOpen} onOpenChange={setFilterOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="default" className="gap-2 relative h-11">
              <Filter className="w-5 h-5" />
              Filter
              {activeFilterCount > 0 && (
                <span className="absolute -top-2 -right-2 w-6 h-6 bg-primary text-primary-foreground text-xs font-bold rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown className={`w-4 h-4 transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
        </Collapsible>
      </div>

      {/* Expanded Filters */}
      <Collapsible open={filterOpen}>
        <CollapsibleContent>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 p-4 bg-muted/50 rounded-lg border border-border/50">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Diameter</label>
              <Select value={filterDiameter} onValueChange={setFilterDiameter}>
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All</SelectItem>
                  {uniqueDiameters.map(d => (
                    <SelectItem key={d} value={d.toString()}>{d}mm</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Blades</label>
              <Select value={filterBladeCount} onValueChange={setFilterBladeCount}>
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All</SelectItem>
                  {uniqueBladeCountsFromSelections.map(b => (
                    <SelectItem key={b} value={b.toString()}>{b} Blades</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Angle</label>
              <Select value={filterBladeAngle} onValueChange={setFilterBladeAngle}>
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All</SelectItem>
                  {uniqueBladeAnglesFromSelections.map(a => (
                    <SelectItem key={a} value={a.toString()}>{a}°</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Motor Pole</label>
              <Select value={filterMotorPole} onValueChange={setFilterMotorPole}>
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All</SelectItem>
                  {uniqueMotorPoles.map(p => (
                    <SelectItem key={p} value={p.toString()}>{p}P</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Series</label>
              <Select value={filterSeries} onValueChange={setFilterSeries}>
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All</SelectItem>
                  {uniqueSeries.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Results Count */}
      <div className="text-sm text-muted-foreground font-medium">
        Showing {filteredSelections.length} of {selections.length} results
      </div>

      {/* Results Table */}
      <div className="border rounded-xl overflow-hidden max-h-[600px] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur-sm">
            <TableRow className="h-14">
              <TableHead className="w-[260px] text-sm font-semibold">
                Model
              </TableHead>
              <TableHead className="text-center cursor-pointer hover:bg-muted w-[110px]" onClick={() => handleSort('airflow')}>
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    Airflow
                    <ArrowUpDown className="w-4 h-4" />
                  </div>
                  <span className="text-xs text-muted-foreground font-normal">{AIRFLOW_UNITS[airflowUnit].label}</span>
                </div>
              </TableHead>
              <TableHead className="text-center cursor-pointer hover:bg-muted w-[100px]" onClick={() => handleSort('pressure')}>
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    Pressure
                    <ArrowUpDown className="w-4 h-4" />
                  </div>
                  <span className="text-xs text-muted-foreground font-normal">{PRESSURE_UNITS[pressureUnit].label}</span>
                </div>
              </TableHead>
              <TableHead className="text-center cursor-pointer hover:bg-muted w-[90px]" onClick={() => handleSort('motorRating')}>
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    Motor
                    <ArrowUpDown className="w-4 h-4" />
                  </div>
                  <span className="text-xs text-muted-foreground font-normal">kW</span>
                </div>
              </TableHead>
              <TableHead className="text-center cursor-pointer hover:bg-muted w-[70px]" onClick={() => handleSort('efficiency')}>
                <div className="flex items-center justify-center gap-1.5 text-sm font-semibold">
                  Eff.
                  <ArrowUpDown className="w-4 h-4" />
                </div>
              </TableHead>
              <TableHead className="text-center cursor-pointer hover:bg-muted w-[80px]" onClick={() => handleSort('dutyPointMatch')}>
                <div className="flex items-center justify-center gap-1.5 text-sm font-semibold">
                  Match
                  <ArrowUpDown className="w-4 h-4" />
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSelections.map((selection, index) => (
              <TableRow 
                key={`${selection.fanId}-${selection.bladeCount}-${selection.bladeAngle}-${selection.motorPole}-${index}`}
                className={`cursor-pointer transition-colors h-16 ${
                  isSelected(selection) 
                    ? 'bg-primary/10 hover:bg-primary/15' 
                    : 'hover:bg-muted/50'
                }`}
                onClick={() => onSelect(selection)}
              >
                <TableCell className="font-mono text-sm font-medium">
                  <div className="flex items-center gap-3">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      index === 0 
                        ? 'bg-gradient-accent text-accent-foreground' 
                        : 'bg-secondary text-secondary-foreground'
                    }`}>
                      {index + 1}
                    </span>
                    <div>
                      <div className="text-base font-semibold">{selection.nomenclature}</div>
                      <div className="text-xs text-muted-foreground">
                        {generateDynamicDescription(selection.nomenclatureTemplate, {
                          diameter: selection.diameter,
                          bladeCount: selection.bladeCount,
                          bladeAngle: selection.bladeAngle,
                          motorPole: selection.motorPole,
                          series: selection.series,
                          fireClass: selection.fireClass,
                        }) || selection.series}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-center text-base font-mono font-medium">
                  {formatAirflow(selection.operatingPoint.airflow)}
                </TableCell>
                <TableCell className="text-center text-base font-mono font-medium">
                  {formatPressure(selection.operatingPoint.staticPressure)}
                </TableCell>
                <TableCell className="text-center text-base font-mono font-medium">{formatPower(selection.motorRating)}kW</TableCell>
                <TableCell className="text-center text-base font-mono font-medium">{selection.operatingPoint.efficiency}%</TableCell>
                <TableCell className={`text-center text-lg font-bold font-mono ${getMatchColor(selection.dutyPointMatch)}`}>
                  {Math.round(selection.dutyPointMatch)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
