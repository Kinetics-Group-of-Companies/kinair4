import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects, useProjectItems, Project, ProjectItem, CreateProjectData } from '@/hooks/useProjects';
import { useAuth } from '@/lib/authContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ProjectDialog } from './ProjectDialog';
import { generateProjectDatasheet } from '@/lib/projectDatasheetGenerator';
import { supabase } from '@/integrations/backend/client';
import { toast } from '@/hooks/use-toast';
import { 
  Plus, 
  MoreVertical, 
  Pencil, 
  Trash2, 
  FileText, 
  ChevronDown, 
  ChevronRight,
  FolderOpen,
  Download,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  completed: 'bg-blue-100 text-blue-800',
};

export function ProjectsList() {
  const { projects, isLoading, createProject, updateProject, deleteProject } = useProjects();
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  const handleCreateProject = async (data: CreateProjectData) => {
    await createProject.mutateAsync(data);
    setShowProjectDialog(false);
  };

  const handleUpdateProject = async (data: CreateProjectData) => {
    if (!editingProject) return;
    await updateProject.mutateAsync({ id: editingProject.id, ...data });
    setEditingProject(null);
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    await deleteProject.mutateAsync(projectToDelete.id);
    setProjectToDelete(null);
    setDeleteDialogOpen(false);
  };

  const toggleExpand = (projectId: string) => {
    setExpandedProjectId(expandedProjectId === projectId ? null : projectId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Projects & Quotes</h2>
        <Button onClick={() => setShowProjectDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Project
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No projects yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create a project to start saving fan selections and generating quotes.
            </p>
            <Button onClick={() => setShowProjectDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              isExpanded={expandedProjectId === project.id}
              onToggleExpand={() => toggleExpand(project.id)}
              onEdit={() => setEditingProject(project)}
              onDelete={() => {
                setProjectToDelete(project);
                setDeleteDialogOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <ProjectDialog
        open={showProjectDialog}
        onOpenChange={setShowProjectDialog}
        onSave={handleCreateProject}
        isLoading={createProject.isPending}
      />

      <ProjectDialog
        open={!!editingProject}
        onOpenChange={(open) => !open && setEditingProject(null)}
        project={editingProject}
        onSave={handleUpdateProject}
        isLoading={updateProject.isPending}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{projectToDelete?.name}"? This will also delete all fan selections in this project. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProject} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ProjectCardProps {
  project: Project;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function ProjectCard({ project, isExpanded, onToggleExpand, onEdit, onDelete }: ProjectCardProps) {
  const navigate = useNavigate();
  const { tenantId } = useAuth();
  const { items, updateItem, deleteItem } = useProjectItems(isExpanded ? project.id : null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingQuantity, setEditingQuantity] = useState<number>(1);

  const handleGenerateDatasheet = async () => {
    if (items.length === 0) {
      toast({ title: 'No fans in project', description: 'Add fan selections before generating datasheet', variant: 'destructive' });
      return;
    }

    setGeneratingPdf(true);
    try {
      // Fetch tenant logo
      let logoUrl: string | undefined;
      if (tenantId) {
        const { data: tenant } = await supabase
          .from('tenants')
          .select('logo_url, name')
          .eq('id', tenantId)
          .single();
        logoUrl = tenant?.logo_url || undefined;
      }

      await generateProjectDatasheet({
        projectName: project.name,
        projectReference: project.project_reference || undefined,
        clientName: project.client_name || undefined,
        clientAddress: project.client_address || undefined,
        items,
        logoUrl,
        tenantId: tenantId || '',
      });

      toast({ title: 'Datasheet generated successfully' });
    } catch (error) {
      console.error('Failed to generate datasheet:', error);
      toast({ title: 'Failed to generate datasheet', variant: 'destructive' });
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleReviseSelection = (item: ProjectItem) => {
    // Navigate to fan selector with pre-filled criteria
    navigate(`/?airflow=${item.required_airflow}&pressure=${item.required_pressure}&poles=${item.motor_poles}`);
  };

  const handleStartEditQuantity = (item: ProjectItem) => {
    setEditingItemId(item.id);
    setEditingQuantity(item.quantity);
  };

  const handleSaveQuantity = async (itemId: string) => {
    await updateItem.mutateAsync({ id: itemId, quantity: editingQuantity });
    setEditingItemId(null);
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={onToggleExpand}>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {project.name}
                <Badge className={statusColors[project.status] || statusColors.draft}>
                  {project.status}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {project.project_reference && `${project.project_reference} • `}
                {project.client_name && `${project.client_name} • `}
                Updated {format(new Date(project.updated_at), 'MMM d, yyyy')}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleGenerateDatasheet}
              disabled={generatingPdf}
            >
              {generatingPdf ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-1" />
              )}
              Datasheet
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Project
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="pt-0">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No fan selections yet. Use the Fan Selector to add fans to this project.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Fan</TableHead>
                  <TableHead>Operating Point</TableHead>
                  <TableHead>Motor</TableHead>
                  <TableHead className="text-center w-20">Qty</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium">{item.nomenclature || `${item.series_name}-${item.diameter}`}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.blade_count}B/{item.blade_angle}° • {item.motor_poles}P
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {item.operating_airflow?.toFixed(0) || '-'} m³/h
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.operating_pressure?.toFixed(0) || '-'} Pa • {item.efficiency?.toFixed(1) || '-'}%
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{item.motor_rating_kw || '-'} kW</div>
                      <div className="text-xs text-muted-foreground">{item.motor_frame || '-'}</div>
                    </TableCell>
                    <TableCell className="text-center">
                      {editingItemId === item.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={1}
                            value={editingQuantity}
                            onChange={(e) => setEditingQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-14 h-7 text-center text-sm"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveQuantity(item.id);
                              if (e.key === 'Escape') setEditingItemId(null);
                            }}
                            autoFocus
                          />
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6"
                            onClick={() => handleSaveQuantity(item.id)}
                          >
                            ✓
                          </Button>
                        </div>
                      ) : (
                        <span 
                          className="cursor-pointer hover:text-primary"
                          onClick={() => handleStartEditQuantity(item)}
                          title="Click to edit"
                        >
                          {item.quantity}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7"
                          onClick={() => handleReviseSelection(item)}
                          title="Revise Selection"
                        >
                          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7"
                          onClick={() => deleteItem.mutate(item.id)}
                          title="Remove from Project"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      )}
    </Card>
  );
}
