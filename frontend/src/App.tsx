import { Route, Routes } from 'react-router-dom';

import { AppShell } from './components/AppShell';
import { DrillPage } from './pages/DrillPage';
import { ChartsPage } from './pages/ChartsPage';
import { GridPreviewPage } from './pages/GridPreviewPage';
import { HistoryPage } from './pages/HistoryPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RangePage } from './pages/RangePage';
import { TablePreviewPage } from './pages/TablePreviewPage';

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/drill/:drillId" element={<DrillPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/charts" element={<ChartsPage />} />
        <Route path="/charts/:rangeId" element={<RangePage />} />
        {/* The v1 path, kept because summaries already link to it. */}
        <Route path="/range/:rangeId" element={<RangePage />} />
        <Route path="/dev/grid" element={<GridPreviewPage />} />
        <Route path="/dev/table" element={<TablePreviewPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}
