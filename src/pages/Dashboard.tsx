import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from '@/components/ui/card';
import {
  Tabs, TabsContent, TabsList, TabsTrigger
} from '@/components/ui/tabs';
import {
  Car, Users, CreditCard, TrendingUp, AlertCircle
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell
} from 'recharts';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

const Dashboard = () => {
  const [dateRange] = useState('30'); // Can be used for filtering later

  const { data: stats, isLoading, isError } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      try {
        // Calculate date range for upcoming installments (next 7 days)
        const today = new Date();
        const sevenDaysLater = new Date();
        sevenDaysLater.setDate(today.getDate() + 7);
        
        const todayStr = today.toISOString().split('T')[0];
        const sevenDaysLaterStr = sevenDaysLater.toISOString().split('T')[0];

        // Fetch all required data in parallel
        const [
          { count: totalRikshaws, error: rikshawsError },
          { count: totalCustomers, error: customersError },
          { data: installmentPlans, error: plansError },
          { data: upcomingInstallments, error: installmentsError },
          { data: availableRikshaws, error: availableError },
          { data: soldRikshaws, error: soldError },
          { data: paidInstallments, error: paidError }
        ] = await Promise.all([
          supabase.from('rikshaws').select('*', { count: 'exact', head: true }),
          supabase.from('customers').select('*', { count: 'exact', head: true }),
          supabase.from('installment_plans').select('*'),
          supabase.from('installments')
            .select('*, installment_plans(customer_id, customers(name))')
            .gte('due_date', todayStr)
            .lte('due_date', sevenDaysLaterStr)
            .eq('status', 'unpaid')
            .order('due_date', { ascending: true }),
          supabase.from('rikshaws').select('*').eq('status', 'available'),
          supabase.from('rikshaws').select('*').eq('status', 'sold'),
          // Fetch all paid installments
          supabase.from('installments')
            .select('amount')
            .eq('status', 'paid')
        ]);

        // Handle any errors
        const errors = [
          rikshawsError, customersError, plansError, 
          installmentsError, availableError, soldError, paidError
        ].filter(Boolean);
        
        if (errors.length > 0) {
          throw new Error(`Database errors: ${errors.map(e => e.message).join(', ')}`);
        }

        // Calculate advance payments
        const advancePayments = installmentPlans?.reduce(
          (sum, plan) => sum + Number(plan.advance_paid || 0),
          0
        ) || 0;

        // Calculate paid installments
        const paidAmount = paidInstallments?.reduce(
          (sum, installment) => sum + Number(installment.amount || 0),
          0
        ) || 0;

        // Total revenue is advance payments + paid installments
        const totalRevenue = advancePayments + paidAmount;

        // 🟦 Dynamic Sales Data by Month
        const salesByMonth = soldRikshaws?.reduce((acc, rikshaw) => {
          const date = new Date(rikshaw.created_at);
          const month = date.toLocaleString('default', { month: 'short' });
          const year = date.getFullYear();
          const key = `${month} ${year}`;

          if (!acc[key]) {
            acc[key] = { month: key, sales: 0, revenue: 0 };
          }

          acc[key].sales += 1;
          acc[key].revenue += Number(rikshaw.advance_paid || 0);
          return acc;
        }, {}) || {};

        const salesData = Object.values(salesByMonth).sort((a, b) => {
          return new Date(`1 ${a.month}`) - new Date(`1 ${b.month}`);
        });

        const statusData = [
          {
            name: 'Available',
            value: availableRikshaws?.length || 0,
            color: '#10b981',
          },
          {
            name: 'Sold',
            value: soldRikshaws?.length || 0,
            color: '#3b82f6',
          },
        ];

        return {
          totalRikshaws,
          totalCustomers,
          totalRevenue,
          advancePayments,
          paidAmount,
          availableRikshaws: availableRikshaws?.length || 0,
          soldRikshaws: soldRikshaws?.length || 0,
          installmentPlans: installmentPlans || [],
          upcomingInstallments: upcomingInstallments || [],
          salesData,
          statusData
        };
      } catch (error) {
        console.error('Dashboard query error:', error);
        throw error;
      }
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-8">
        <DashboardHeader />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <div className="space-y-8">
        <DashboardHeader />
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
          <h2 className="text-xl font-bold mb-2">Failed to load dashboard data</h2>
          <p className="text-muted-foreground mb-4">
            We couldn't retrieve your dashboard information. Please try again.
          </p>
          <button 
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={() => window.location.reload()}
          >
            Reload Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <DashboardHeader />

      {/* 🟩 Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Rikshaws</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalRikshaws}</div>
            <p className="text-xs text-muted-foreground">
              <Badge variant="success">{stats.availableRikshaws} available</Badge>{' '}
              <Badge variant="secondary">{stats.soldRikshaws} sold</Badge>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCustomers}</div>
            <p className="text-xs text-muted-foreground">
              <Badge variant="outline">{stats.installmentPlans.length} active plans</Badge>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              PKR {stats.totalRevenue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              <Badge variant="success">PKR {stats.advancePayments.toLocaleString()} advance</Badge>{' '}
              <Badge variant="secondary">PKR {stats.paidAmount.toLocaleString()} installments</Badge>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upcoming Installments</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.upcomingInstallments.length}</div>
            <p className="text-xs text-muted-foreground">Due in next 7 days</p>
          </CardContent>
        </Card>
      </div>

      {/* 🟨 Charts Section */}
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
                <BarChart data={stats.salesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value) => [Number(value).toLocaleString(), 'Value']}
                    labelFormatter={(label) => `Month: ${label}`}
                  />
                  <Bar dataKey="sales" fill="#3b82f6" name="Rikshaws Sold" />
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={stats.statusData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        dataKey="value"
                      >
                        {stats.statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => Number(value).toLocaleString()} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center">
                    <div className="h-3 w-3 rounded-full bg-[#10b981] mr-2"></div>
                    <span>Available: {stats.availableRikshaws}</span>
                  </div>
                  <div className="flex items-center">
                    <div className="h-3 w-3 rounded-full bg-[#3b82f6] mr-2"></div>
                    <span>Sold: {stats.soldRikshaws}</span>
                  </div>
                  <div className="pt-4">
                    <h4 className="font-medium mb-2">Inventory Value</h4>
                    <p className="text-sm text-muted-foreground">
                      Estimated: PKR {(stats.availableRikshaws * 250000).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
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
                <LineChart data={stats.salesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value) => [`PKR ${Number(value).toLocaleString()}`, 'Revenue']}
                    labelFormatter={(label) => `Month: ${label}`}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="#10b981" 
                    strokeWidth={2} 
                    name="Revenue"
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 🟥 Upcoming Installments */}
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Installments</CardTitle>
          <CardDescription>Installments due in the next 7 days</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.upcomingInstallments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CreditCard className="h-12 w-12 mx-auto mb-4" />
              <p>No upcoming installments in the next 7 days</p>
            </div>
          ) : (
            <div className="space-y-4">
              {stats.upcomingInstallments.map((installment: any) => {
                const dueDate = new Date(installment.due_date);
                const today = new Date();
                const daysUntilDue = Math.ceil(
                  (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                );
                
                return (
                  <div
                    key={installment.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div>
                      <p className="font-medium">Installment #{installment.installment_number}</p>
                      <p className="text-sm text-muted-foreground">
                        Customer: {installment.installment_plans?.customers?.name || 'Unknown'}
                      </p>
                      <p className={`text-sm ${
                        daysUntilDue <= 1 ? 'text-red-500 font-medium' : 
                        daysUntilDue <= 3 ? 'text-amber-500' : 'text-muted-foreground'
                      }`}>
                        Due: {dueDate.toLocaleDateString()} 
                        {daysUntilDue >= 0 && (
                          <span> (in {daysUntilDue} day{daysUntilDue !== 1 ? 's' : ''})</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">PKR {Number(installment.amount).toLocaleString()}</p>
                      <Badge variant="warning">Upcoming</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;