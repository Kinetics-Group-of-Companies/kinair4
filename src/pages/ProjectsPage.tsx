import { MainLayout } from '@/components/layout/MainLayout';
import { ProjectsList } from '@/components/projects/ProjectsList';
import { useAuth } from '@/lib/authContext';
import { Navigate } from 'react-router-dom';
import { FolderKanban } from 'lucide-react';

export default function ProjectsPage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </MainLayout>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <MainLayout>
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-background py-8 px-4 border-b">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <FolderKanban className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Projects & Quotes</h1>
            <h2 className="sr-only">Saved fan selection projects and quotes</h2>
          </div>
          <p className="text-muted-foreground max-w-2xl">
            Manage your fan selection projects, save configurations, and generate professional quotes for your clients.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <ProjectsList />
      </div>
    </MainLayout>
  );
}
