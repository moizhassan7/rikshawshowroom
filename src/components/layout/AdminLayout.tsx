
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { 
  SidebarProvider, 
  Sidebar, 
  SidebarContent, 
  SidebarHeader, 
  SidebarMenu, 
  SidebarMenuItem, 
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset
} from '@/components/ui/sidebar';
import { 
  ShoppingBag,
  LayoutDashboard, 
  Car, 
  Users, 
  CreditCard, 
  BarChart3, 
  Settings,
  Building2
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const AdminLayout = () => {
  const location = useLocation();

  const menuItems = [
   
    {
      title: 'Dashboard',
      icon: LayoutDashboard,
      href: '/dashboard',
    },
      {
      title: 'Sell a Rikshaw',
      icon: ShoppingBag,
      href: '/sell-rickshaw',
    },
    {
      title: 'Rikshaws Managment',
      icon: Car,
      href: '/rikshaws',
    },
    {
      title: 'Customers Mangement',
      icon: Users,
      href: '/customers',
    },
    {
      title: 'Installments Plans',
      icon: CreditCard,
      href: '/installments',
    },
    {
      title: 'Reports',
      icon: BarChart3,
      href: '/reports',
    },
  ];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <Sidebar>
          <SidebarHeader className="border-b px-6 py-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" />
              <span className="font-bold text-lg">Al-Hamad Traders</span>
            </div>
          </SidebarHeader>
          
          <SidebarContent className="px-4 py-6">
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={location.pathname === item.href}>
                    <Link to={item.href} className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>

        <SidebarInset className="flex-1">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
          </header>
          <main className="flex-1 p-6">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default AdminLayout;
