import { ReactNode } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import { OfflineSyncBar } from '@/components/offline/OfflineSyncBar';
import { UpdateBanner } from '@/components/offline/UpdateBanner';

interface MainLayoutProps {
  children: ReactNode;
  focusMode?: boolean;
}

export function MainLayout({ children, focusMode = false }: MainLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <UpdateBanner />
      <OfflineSyncBar />

      {!focusMode && <Header />}
      <main className="flex-1">
        {children}
      </main>

      {!focusMode && <Footer />}
    </div>
  );
}
