import { createBrowserRouter } from "react-router";
import { RoxyLandingPage } from "./pages/RoxyLandingPage";
import { HomePage } from "./pages/HomePage";
import { AssetLibraryPage } from "./pages/AssetLibraryPage";
import { FactoryEditorPage } from "./pages/FactoryEditorPage";
import { FactoryEditorPageShenzhenP3 } from "./pages/FactoryEditorPageShenzhenP3";
import { FactoryProjectsPage } from "./pages/FactoryProjectsPage";
import { LogPage } from "./pages/LogPage";
import { DataBindingPage } from "./pages/DataBindingPage";
import { ModelUploadPage } from "./pages/ModelUploadPage";
import { IntegrationPage } from "./pages/IntegrationPage";
import { SystemAdminPage } from "./pages/SystemAdminPage";
import { AssetVersionManagementPage } from "./pages/AssetVersionManagementPage";
import { AssetEditorPage } from "./pages/AssetEditorPage";
import { ModelLifecyclePage } from "./pages/ModelLifecyclePage";

export const router = createBrowserRouter([
  // Roxy Landing Page
  { path: "/roxy", Component: RoxyLandingPage },

  // Home / Dashboard
  { path: "/", Component: HomePage },

  // Asset Library
  { path: "/asset-library", Component: AssetLibraryPage },
  { path: "/asset-library/lifecycle", Component: ModelLifecyclePage },
  {
    path: "/asset-library/asset-versions/:assetId",
    Component: AssetVersionManagementPage,
  },
  {
    path: "/asset-library/editor/:assetId",
    Component: AssetEditorPage,
  },
  { path: "/asset-library/:category", Component: AssetLibraryPage },
  { path: "/asset-library/upload", Component: ModelUploadPage },

  // Factory Projects List
  { path: "/factories", Component: FactoryProjectsPage },

  // Factory Projects
  { path: "/factory/new", Component: FactoryEditorPage },
  { path: "/factory/shenzhen-p3", Component: FactoryEditorPageShenzhenP3 },
  { path: "/factory/:projectId", Component: FactoryEditorPage },
  { path: "/factory/:projectId/versions", Component: LogPage },
  { path: "/factory/:projectId/data-binding", Component: DataBindingPage },
  { path: "/factory/:projectId/integration", Component: IntegrationPage },

  // Integration
  { path: "/integration", Component: IntegrationPage },

  // System Admin
  { path: "/admin", Component: SystemAdminPage },
  { path: "/admin/:tab", Component: SystemAdminPage },
]);
