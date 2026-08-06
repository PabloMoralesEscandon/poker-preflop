import { Route, Routes } from 'react-router-dom';

import { AppShell } from './components/AppShell';
import { DrillPage } from './pages/DrillPage';
import { GridPreviewPage } from './pages/GridPreviewPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/drill/:drillId" element={<DrillPage />} />
        <Route path="/dev/grid" element={<GridPreviewPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}
