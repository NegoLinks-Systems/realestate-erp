import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { RequireAuth } from './components/RequireAuth';
import { RequirePermission } from './components/RequirePermission';
import Login from './pages/auth/Login';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import Dashboard from './pages/Dashboard';
import PropertiesList from './pages/properties/PropertiesList';
import PropertyDetail from './pages/properties/PropertyDetail';
import OverviewTab from './pages/properties/tabs/OverviewTab';
import StructureTab from './pages/properties/tabs/StructureTab';
import UnitsTab from './pages/properties/tabs/UnitsTab';
import PhotosTab from './pages/properties/tabs/PhotosTab';
import DocumentsTab from './pages/properties/tabs/DocumentsTab';
import ManagersTab from './pages/properties/tabs/ManagersTab';
import ParcelsTab from './pages/properties/tabs/ParcelsTab';
import TenantsList from './pages/tenants/TenantsList';
import TenantDetail from './pages/tenants/TenantDetail';
import LandlordsList from './pages/landlords/LandlordsList';
import LandlordDetail from './pages/landlords/LandlordDetail';
import LeasesList from './pages/leases/LeasesList';
import LeaseDetail from './pages/leases/LeaseDetail';
import TenantPortal from './pages/portal/TenantPortal';
import FinanceLayout, { FinanceOverview } from './pages/finance/FinanceLayout';
import { InvoicesList, InvoiceDetail, PaymentsPage } from './pages/finance/Invoices';
import { ExpensesPage } from './pages/finance/Expenses';
import { PenaltyRulesPage } from './pages/finance/PenaltyRules';
import { StatementsPage, MyStatementsPage } from './pages/finance/Statements';
import MaintenanceLayout, { RequestsList } from './pages/maintenance/MaintenanceLayout';
import { WorkOrdersList, WorkOrderDetail } from './pages/maintenance/WorkOrders';
import { ContractorsPage } from './pages/maintenance/Contractors';
import FacilitiesLayout, { AssetsList, AssetDetail } from './pages/facilities/FacilitiesLayout';
import { OperationsPage } from './pages/facilities/Operations';
import { InspectionsList, InspectionDetail } from './pages/facilities/Inspections';
import VisitorsPage from './pages/visitors/VisitorsPage';
import ParkingPage from './pages/parking/ParkingPage';
import ProcurementLayout, { RequisitionsPage } from './pages/procurement/ProcurementLayout';
import { PurchaseOrdersList, PurchaseOrderDetail } from './pages/procurement/PurchaseOrders';
import { InventoryPage } from './pages/procurement/Inventory';
import { VendorsPage } from './pages/procurement/Vendors';
import SettingsLayout from './pages/settings/SettingsLayout';
import OrganizationSettings from './pages/settings/OrganizationSettings';
import BrandingSettings from './pages/settings/BrandingSettings';
import DomainSettings from './pages/settings/DomainSettings';
import AiSettings from './pages/settings/AiSettings';
import Branches from './pages/settings/Branches';
import UsersRoles from './pages/settings/UsersRoles';
import ActivityLog from './pages/settings/ActivityLog';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/properties" element={<RequirePermission module="properties"><PropertiesList /></RequirePermission>} />
        <Route path="/properties/:id" element={<RequirePermission module="properties"><PropertyDetail /></RequirePermission>}>
          <Route index element={<OverviewTab />} />
          <Route path="structure" element={<StructureTab />} />
          <Route path="units" element={<UnitsTab />} />
          <Route path="photos" element={<PhotosTab />} />
          <Route path="documents" element={<DocumentsTab />} />
          <Route path="managers" element={<ManagersTab />} />
          <Route path="parcels" element={<ParcelsTab />} />
        </Route>
        <Route path="/tenants" element={<RequirePermission module="tenants"><TenantsList /></RequirePermission>} />
        <Route path="/tenants/:id" element={<RequirePermission module="tenants"><TenantDetail /></RequirePermission>} />
        <Route path="/landlords" element={<RequirePermission module="landlords"><LandlordsList /></RequirePermission>} />
        <Route path="/landlords/:id" element={<RequirePermission module="landlords"><LandlordDetail /></RequirePermission>} />
        <Route path="/leases" element={<RequirePermission module="leases"><LeasesList /></RequirePermission>} />
        <Route path="/leases/:id" element={<RequirePermission module="leases"><LeaseDetail /></RequirePermission>} />
        <Route path="/portal" element={<TenantPortal />} />
        <Route path="/finance" element={<RequirePermission module="finance"><FinanceLayout /></RequirePermission>}>
          <Route index element={<FinanceOverview />} />
          <Route path="invoices" element={<InvoicesList />} />
          <Route path="invoices/:id" element={<InvoiceDetail />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="statements" element={<StatementsPage />} />
          <Route path="penalties" element={<PenaltyRulesPage />} />
        </Route>
        <Route path="/my-statements" element={<MyStatementsPage />} />
        <Route path="/maintenance" element={<RequirePermission module="maintenance"><MaintenanceLayout /></RequirePermission>}>
          <Route index element={<RequestsList />} />
          <Route path="work-orders" element={<WorkOrdersList />} />
          <Route path="contractors" element={<ContractorsPage />} />
        </Route>
        <Route path="/maintenance/work-orders/:id" element={<RequirePermission module="maintenance"><WorkOrderDetail /></RequirePermission>} />
        <Route path="/facilities" element={<RequirePermission module="facilities"><FacilitiesLayout /></RequirePermission>}>
          <Route index element={<AssetsList />} />
          <Route path="operations" element={<OperationsPage />} />
          <Route path="inspections" element={<InspectionsList />} />
        </Route>
        <Route path="/facilities/assets/:id" element={<RequirePermission module="facilities"><AssetDetail /></RequirePermission>} />
        <Route path="/facilities/inspections/:id" element={<RequirePermission module="facilities"><InspectionDetail /></RequirePermission>} />
        <Route path="/visitors" element={<RequirePermission module="visitors"><VisitorsPage /></RequirePermission>} />
        <Route path="/parking" element={<RequirePermission module="parking"><ParkingPage /></RequirePermission>} />
        <Route path="/procurement" element={<RequirePermission module="procurement"><ProcurementLayout /></RequirePermission>}>
          <Route index element={<RequisitionsPage />} />
          <Route path="orders" element={<PurchaseOrdersList />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="vendors" element={<VendorsPage />} />
        </Route>
        <Route path="/procurement/orders/:id" element={<RequirePermission module="procurement"><PurchaseOrderDetail /></RequirePermission>} />
        <Route path="/settings" element={<SettingsLayout />}>
          <Route index element={<RequirePermission module="settings" action="update"><OrganizationSettings /></RequirePermission>} />
          <Route path="branding" element={<RequirePermission module="settings" action="update"><BrandingSettings /></RequirePermission>} />
          <Route path="domain" element={<RequirePermission module="settings" action="update"><DomainSettings /></RequirePermission>} />
          <Route path="ai" element={<RequirePermission module="settings" action="update"><AiSettings /></RequirePermission>} />
          <Route path="branches" element={<RequirePermission module="branches"><Branches /></RequirePermission>} />
          <Route path="users" element={<RequirePermission module="users"><UsersRoles /></RequirePermission>} />
          <Route path="activity" element={<RequirePermission module="audit"><ActivityLog /></RequirePermission>} />
        </Route>
      </Route>
    </Routes>
  );
}
