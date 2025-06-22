
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Car, Users, CreditCard, TrendingUp, Package, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import DashboardHeader from '@/components/dashboard/DashboardHeader';

const Dashboard = () => {
  const [dateRange, setDateRange] = useState('30');

  // Fetch dashboard statistics
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [
        { count: totalRikshaws },
        { count: totalCustomers },
        { data: installmentPlans },
        { data: recentInstallments },
        { data: availableRikshaws },
        { data: soldRikshaws }
      ] = await Promise.all([
        supabase.from('rikshaws').select('*', { count: 'exact', head: true }),
        supabase.from('customers').select('*', { count: 'exact', head: true }),
        supabase.from('installment_plans').select('*'),
        supabase.from('installments').select('*, installment_plans(customer_id, customers(name))').order('created_at', { ascending: false }).limit(5),
        supabase.from('rikshaws').select('*').eq('status', 'available'),
        supabase.from('rikshaws').select('*').eq('status', 'sold')
      ]);

      const totalRevenue = installmentPlans?.reduce((sum, plan) => sum + Number(plan.advance_paid), 0) || 0;
      const pendingInstallments = recentInstallments?.filter(inst => inst.status === 'unpaid').length || 0;

      return {
        totalRikshaws: totalRikshaws || 0,
        totalCustomers: totalCustomers || 0,
        totalRevenue,
        pendingInstallments,
        availableRikshaws: availableRikshaws?.length || 0,
        soldRikshaws: soldRikshaws?.length || 0,
        installmentPlans: installmentPlans || [],
        recentInstallments: recentInstallments || []
      };
    }
  });

  // Sample data for charts
  const salesData = [
    { month: 'Jan', sales: 12, revenue: 2400000 },
    { month: 'Feb', sales: 19, revenue: 3800000 },
    { month: 'Mar', sales: 15, revenue: 3000000 },
    { month: 'Apr', sales: 25, revenue: 5000000 },
    { month: 'May', sales: 22, revenue: 4400000 },
    { month: 'Jun', sales: 30, revenue: 6000000 },
  ];

  const statusData = [
    { name: 'Available', value: stats?.availableRikshaws || 0, color: '#10b981' },
    { name: 'Sold', value: stats?.soldRikshaws || 0, color: '#3b82f6' },
  ];

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="space-y-8">
      <DashboardHeader />
      
      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Rikshaws</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalRikshaws}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.availableRikshaws} available, {stats?.soldRikshaws} sold
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalCustomers}</div>
            <p className="text-xs text-muted-foreground">Active customers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">PKR {stats?.totalRevenue?.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">From advance payments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Installments</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pendingInstallments}</div>
            <p className="text-xs text-muted-foreground">Require attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <Tabs defaultValue="sales" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sales">Sales Overview</TabsTrigger>
          <TabsTrigger value="inventory">Inventory Status</TabsTrigger>
          <TabsTrigger value="revenue">Revenue Trend</TabsTrigger>
        </TabsList>

        <TabsContent value="sales">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Sales</CardTitle>
              <CardDescription>Number of rikshaws sold per month</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={salesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="sales" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory">
          <Card>
            <CardHeader>
              <CardTitle>Inventory Status</CardTitle>
              <CardDescription>Current status of rikshaws in inventory</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Trend</CardTitle>
              <CardDescription>Monthly revenue from sales</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={salesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value) => [`PKR ${Number(value).toLocaleString()}`, 'Revenue']} />
                  <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Installments</CardTitle>
          <CardDescription>Latest installment payments and updates</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats?.recentInstallments?.map((installment: any) => (
              <div key={installment.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">Installment #{installment.installment_number}</p>
                  <p className="text-sm text-muted-foreground">
                    Customer: {installment.installment_plans?.customers?.name || 'Unknown'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium">PKR {Number(installment.amount).toLocaleString()}</p>
                  <p className={`text-sm ${installment.status === 'paid' ? 'text-green-600' : 'text-red-600'}`}>
                    {installment.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
