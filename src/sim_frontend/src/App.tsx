import { createBrowserRouter, RouterProvider } from 'react-router';
import { AIFactoryHome } from './pages/home/AIFactoryHome';
import { SimulationLayout } from './components/layout/SimulationLayout';
import { PlanListPage } from './pages/simulation/PlanListPage';
import { PlanConfigPage } from './pages/simulation/PlanConfigPage';
import { AnomalyInjectionPage } from './pages/simulation/AnomalyInjectionPage';
import { SimulationRunningPage } from './pages/simulation/SimulationRunningPage';
import { ResultAnalysisPage } from './pages/simulation/ResultAnalysisPage';
import { AIAnalysisPage } from './pages/simulation/AIAnalysisPage';
import { PlanComparePage } from './pages/simulation/PlanComparePage';
import { MasterDataPage } from './pages/simulation/MasterDataPage';
import { TemplatesPage } from './pages/simulation/TemplatesPage';
import { ReportExportPage } from './pages/simulation/ReportExportPage';

const router = createBrowserRouter([
  { path: '/', Component: AIFactoryHome },
  {
    path: '/simulation',
    Component: SimulationLayout,
    children: [
      { index: true, Component: PlanListPage },
      { path: 'compare', Component: PlanComparePage },
      { path: 'master-data', Component: MasterDataPage },
      { path: 'templates', Component: TemplatesPage },
      { path: 'plan/:planId/config', Component: PlanConfigPage },
      { path: 'plan/:planId/anomaly', Component: AnomalyInjectionPage },
      { path: 'plan/:planId/running', Component: SimulationRunningPage },
      { path: 'plan/:planId/result', Component: ResultAnalysisPage },
      { path: 'plan/:planId/ai', Component: AIAnalysisPage },
      { path: 'plan/:planId/export', Component: ReportExportPage },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
