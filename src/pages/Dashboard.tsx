import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Car, Calendar, DollarSign, Check, ChevronDown, ChevronUp, Printer, Plus, X, Eye, Search, SortAsc, SortDesc, TrendingUp, AlertCircle, Clock, CheckCircle, Users, ShoppingCart, TrendingDown } from 'lucide-react'; // Added ShoppingCart and TrendingDown for new metrics
import { format, addMonths, isBefore, isAfter, parseISO, startOfMonth, endOfMonth, eachMonthOfInterval, startOfYear, endOfYear, getMonth, getYear } from 'date-fns';
import { cn } from '@/lib/utils';

// Interface definitions for data structures (re-used and updated)
interface Customer {
  id: string;
  name: string;
  address: string;
  cnic: string;
  phone: string;
  guarantor_name: string;
  guarantor_cnic: string;
  guarantor_phone: string;
  guarantor_address: string;
  bank_name: string;
  cheque_number: string;
}

interface Rikshaw {
  id: string;
  manufacturer: string;
  model_name: string;
  engine_number: string;
  chassis_number: string;
  registration_number: string | null;
  type: string;
  availability: string; // 'sold', 'unsold'
  purchase_date: string; // Added purchase_date
  purchase_price: number; // Added purchase_price
  sale_price: number | null; // Added sale_price
}

interface AdvancePayment {
  amount: number;
  date: string;
}

interface InstallmentPlan {
  id: string;
  customer_id: string;
  rikshaw_id: string;
  total_price: number;
  advance_paid: number; // Total advance amount agreed upon - This will now be the sum of all initial advance payments
  advance_payments: AdvancePayment[]; // Array of initial individual advance payments made at sale time
  monthly_installment: number;
  duration_months: number;
  guarantor_name: string;
  guarantor_cnic: string;
  guarantor_phone: string;
  guarantor_address: string;
  bank_name: string;
  cheque_number: string;
  rikshaw_details: {
    manufacturer: string;
    model_name: string;
    engine_number: string;
    chassis_number: string;
    registration_number: string;
    type: string;
  };
  customers: Customer; // Nested customer details
  rikshaws: Rikshaw; // Nested rikshaw details (updated to include purchase/sale price)
  created_at: string; // Sale date
  total_paid_monthly_installments?: number; // Aggregate of only monthly payments
}

interface InstallmentPayment {
  id: string;
  installment_plan_id: string;
  payment_date: string; // ISO string 'YYYY-MM-DD'
  amount_paid: number;
  received_by: string;
  payment_type: 'monthly' | 'advance_adjustment';
  installment_number?: number | null; // New field for monthly installment number
  created_at: string;
}

// Dashboard specific interfaces
interface UpcomingInstallment {
  planId: string;
  customerName: string;
  rikshawDetails: string;
  type: 'monthly' | 'advance';
  installmentNumber?: number;
  amountDue: number;
  dueDate: string;
  status: 'due' | 'overdue';
}

const Dashboard = () => {
  const { toast } = useToast();

  const currentMonthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const currentMonthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');

  // Fetch total rickshaws
  const { data: totalRickshaws = 0, isLoading: loadingTotalRickshaws } = useQuery<number>({
    queryKey: ['total-rikshaws'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('rikshaws')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count || 0;
    }
  });

  // Fetch rickshaws sold this month (count of installment plans created this month)
  const { data: soldThisMonth = 0, isLoading: loadingSoldThisMonth } = useQuery<number>({
    queryKey: ['sold-this-month-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('installment_plans')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', currentMonthStart)
        .lte('created_at', currentMonthEnd);
      if (error) throw error;
      return count || 0;
    }
  });

  // Fetch total customers
  const { data: totalCustomers = 0, isLoading: loadingTotalCustomers } = useQuery<number>({
    queryKey: ['total-customers'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count || 0;
    }
  });

  // Fetch all installment plans with customer and rikshaw details
  const { data: installmentPlans = [], isLoading: loadingPlans, error: plansError } = useQuery<InstallmentPlan[]>({
    queryKey: ['dashboard-installment-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('installment_plans')
        .select(`
          *,
          customers!inner (name, cnic),
          rikshaws!inner (model_name, registration_number, type, purchase_price, sale_price)
        `);
      if (error) throw error;
      return data as InstallmentPlan[];
    }
  });

  // Fetch all payments for calculations
  const { data: allInstallmentPayments = [], isLoading: loadingAllPayments, error: allPaymentsError } = useQuery<InstallmentPayment[]>({
    queryKey: ['dashboard-all-installment-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('installment_payments')
        .select('*');
      if (error) throw error;
      return data as InstallmentPayment[];
    }
  });

  // Fetch rickshaws purchased this month for investment calculation
  const { data: currentMonthPurchases = [], isLoading: loadingCurrentMonthPurchases } = useQuery<Rikshaw[]>({
    queryKey: ['current-month-purchases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rikshaws')
        .select('purchase_price')
        .gte('purchase_date', currentMonthStart)
        .lte('purchase_date', currentMonthEnd);
      if (error) throw error;
      return data as Rikshaw[];
    }
  });

  // Handle errors for fetching data
  useEffect(() => {
    if (plansError) {
      toast({
        title: "Error fetching dashboard plans",
        description: plansError.message,
        variant: "destructive",
      });
    }
    if (allPaymentsError) {
      toast({
        title: "Error fetching dashboard payments",
        description: allPaymentsError.message,
        variant: "destructive",
      });
    }
  }, [plansError, allPaymentsError, toast]);

  // Calculate total revenue (from all installment plans)
  const totalRevenue = useMemo(() => {
    return installmentPlans.reduce((sum, plan) => sum + plan.total_price, 0);
  }, [installmentPlans]);

  // Calculate total payments received (from all payments)
  const totalPaymentsReceived = useMemo(() => {
    const initialAdvancesFromPlans = installmentPlans.reduce((sum, plan) =>
      sum + (plan.advance_payments[0]?.amount || 0), 0);

    const recordedPayments = allInstallmentPayments.reduce((sum, payment) => sum + payment.amount_paid, 0);
    return initialAdvancesFromPlans + recordedPayments;

  }, [installmentPlans, allInstallmentPayments]);

  // Calculate remaining balance for a single plan
  const calculateRemainingBalance = useCallback((plan: InstallmentPlan, payments: InstallmentPayment[]) => {
    const initialFirstAdvance = plan.advance_payments[0]?.amount || 0;
    const totalMonthlyPaymentsReceived = payments.reduce((sum, p) => p.payment_type === 'monthly' ? sum + p.amount_paid : sum, 0);
    const totalAdvanceAdjustmentsCollected = payments.reduce((sum, p) => p.payment_type === 'advance_adjustment' ? sum + p.amount_paid : sum, 0);

    const overallTotalPaid = initialFirstAdvance + totalMonthlyPaymentsReceived + totalAdvanceAdjustmentsCollected;
    return plan.total_price - overallTotalPaid;
  }, []);

  // Calculate total remaining balance across all plans
  const totalRemainingBalance = useMemo(() => {
    if (loadingPlans || loadingAllPayments) return 0;
    return installmentPlans.reduce((sum, plan) => {
      const paymentsForPlan = allInstallmentPayments.filter(p => p.installment_plan_id === plan.id);
      return sum + calculateRemainingBalance(plan, paymentsForPlan);
    }, 0);
  }, [installmentPlans, allInstallmentPayments, loadingPlans, loadingAllPayments, calculateRemainingBalance]);

  // Function to calculate plan status
  const getPlanStatus = useCallback((plan: InstallmentPlan, allPayments: InstallmentPayment[]) => {
    const paymentsForPlan = allPayments.filter(p => p.installment_plan_id === plan.id);

    const totalAgreedAdvance = plan.advance_payments.reduce((sum, p) => sum + p.amount, 0);
    const initialFirstAdvance = plan.advance_payments[0]?.amount || 0;
    const totalAdvanceAdjustmentsCollected = paymentsForPlan.reduce((sum, p) => p.payment_type === 'advance_adjustment' ? sum + p.amount_paid : sum, 0);
    const collectedAdvance = initialFirstAdvance + totalAdvanceAdjustmentsCollected;

    const totalMonthlyPaymentsReceived = paymentsForPlan.reduce((sum, p) => p.payment_type === 'monthly' ? sum + p.amount_paid : sum, 0);
    const overallTotalPaid = initialFirstAdvance + totalMonthlyPaymentsReceived + totalAdvanceAdjustmentsCollected;

    if (overallTotalPaid >= plan.total_price) {
      return 'Completed';
    }

    const remainingAgreedAdvanceDue = totalAgreedAdvance - collectedAdvance;
    if (remainingAgreedAdvanceDue > 0) {
      return 'Advance Pending';
    }

    const saleDate = parseISO(plan.created_at);
    const today = new Date();
    let installmentsDueCount = 0;
    for (let i = 1; i <= plan.duration_months; i++) {
      const dueDate = addMonths(saleDate, i);
      if (isBefore(dueDate, today) || format(dueDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) {
        installmentsDueCount++;
      } else {
        break;
      }
    }

    const expectedMonthlyPaid = installmentsDueCount * plan.monthly_installment;

    if (totalMonthlyPaymentsReceived >= expectedMonthlyPaid) {
      return 'Active';
    } else if (totalMonthlyPaymentsReceived < expectedMonthlyPaid && installmentsDueCount > 0) {
      return 'Overdue';
    }

    return 'Not Active';
  }, []);

  // Calculate overdue and advance pending counts
  const overdueInstallmentsCount = useMemo(() => {
    if (loadingPlans || loadingAllPayments) return 0;
    return installmentPlans.filter(plan => getPlanStatus(plan, allInstallmentPayments) === 'Overdue').length;
  }, [installmentPlans, allInstallmentPayments, loadingPlans, loadingAllPayments, getPlanStatus]);

  const advancePendingCount = useMemo(() => {
    if (loadingPlans || loadingAllPayments) return 0;
    return installmentPlans.filter(plan => getPlanStatus(plan, allInstallmentPayments) === 'Advance Pending').length;
  }, [installmentPlans, allInstallmentPayments, loadingPlans, loadingAllPayments, getPlanStatus]);

  // Calculate total investment in purchased rickshaws this month
  const currentMonthInvestment = useMemo(() => {
    if (loadingCurrentMonthPurchases) return 0;
    return currentMonthPurchases.reduce((sum: number, rikshaw: Rikshaw) => sum + (rikshaw.purchase_price || 0), 0);
  }, [currentMonthPurchases, loadingCurrentMonthPurchases]);

  // Calculate profit for this month's sales
  const currentMonthProfit = useMemo(() => {
    if (loadingPlans) return 0;
    let totalSalePrice = 0;
    let totalPurchasePrice = 0;

    // Filter installment plans created in the current month
    const salesThisMonthPlans = installmentPlans.filter(plan => {
      const planDate = parseISO(plan.created_at);
      return isAfter(planDate, startOfMonth(new Date())) && isBefore(planDate, endOfMonth(new Date()));
    });

    salesThisMonthPlans.forEach(plan => {
      // Access the nested rikshaws object for prices
      if (plan.rikshaws) {
        totalSalePrice += plan.rikshaws.sale_price || 0;
        totalPurchasePrice += plan.rikshaws.purchase_price || 0;
      }
    });
    return totalSalePrice - totalPurchasePrice;
  }, [installmentPlans, loadingPlans]);


  // Generate upcoming installments for the next 6 months
  const upcomingInstallments = useMemo(() => {
    if (loadingPlans || loadingAllPayments) return [];

    const upcoming: UpcomingInstallment[] = [];
    const today = new Date();
    const sixMonthsFromNow = addMonths(today, 6);

    installmentPlans.forEach(plan => {
      const paymentsForPlan = allInstallmentPayments.filter(p => p.installment_plan_id === plan.id);

      // Check for remaining advance due
      const totalAgreedAdvance = plan.advance_payments.reduce((sum, p) => sum + p.amount, 0);
      const initialFirstAdvance = plan.advance_payments[0]?.amount || 0;
      const totalAdvanceAdjustmentsCollected = paymentsForPlan.reduce((sum, p) => p.payment_type === 'advance_adjustment' ? sum + p.amount_paid : sum, 0);
      const collectedAdvance = initialFirstAdvance + totalAdvanceAdjustmentsCollected;
      const remainingAgreedAdvanceDue = totalAgreedAdvance - collectedAdvance;

      if (remainingAgreedAdvanceDue > 0) {
        upcoming.push({
          planId: plan.id,
          customerName: plan.customers.name,
          rikshawDetails: `${plan.rikshaws.model_name} (${plan.rikshaws.registration_number})`,
          type: 'advance',
          amountDue: remainingAgreedAdvanceDue,
          dueDate: format(today, 'yyyy-MM-dd'),
          status: 'overdue',
        });
      }

      // Generate monthly schedule and find upcoming ones
      const saleDate = parseISO(plan.created_at);
      const paymentsByInstallment: Record<number, number> = {};
      paymentsForPlan
        .filter(p => p.payment_type === 'monthly' && p.installment_number !== null)
        .forEach(p => {
          if (p.installment_number) {
            paymentsByInstallment[p.installment_number] = (paymentsByInstallment[p.installment_number] || 0) + p.amount_paid;
          }
        });

      for (let i = 1; i <= plan.duration_months; i++) {
        const dueDate = addMonths(saleDate, i);
        const paidAmount = paymentsByInstallment[i] || 0;
        const expectedAmount = plan.monthly_installment;

        if (paidAmount < expectedAmount) {
          const amountRemainingForInstallment = expectedAmount - paidAmount;
          let status: 'due' | 'overdue' = 'due';
          if (isBefore(dueDate, today) && amountRemainingForInstallment > 0) {
            status = 'overdue';
          }

          if (status === 'overdue' || isBefore(dueDate, sixMonthsFromNow) || format(dueDate, 'yyyy-MM-dd') === format(sixMonthsFromNow, 'yyyy-MM-dd')) {
            upcoming.push({
              planId: plan.id,
              customerName: plan.customers.name,
              rikshawDetails: `${plan.rikshaws.model_name} (${plan.rikshaws.registration_number})`,
              type: 'monthly',
              installmentNumber: i,
              amountDue: amountRemainingForInstallment,
              dueDate: format(dueDate, 'yyyy-MM-dd'),
              status: status,
            });
          }
        }
      }
    });

    upcoming.sort((a, b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime());

    return upcoming;
  }, [installmentPlans, allInstallmentPayments, loadingPlans, loadingAllPayments]);


  return (
    <div className="space-y-8 max-w-7xl mx-auto p-4">
      <div className="text-center mb-6">
        <h1 className="text-4xl font-extrabold text-gray-900">Business Overview Dashboard</h1>
        <p className="text-lg text-muted-foreground mt-2">
          Gain insights into sales, payments, and inventory at a glance.
        </p>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border shadow-sm rounded-lg hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Rickshaws</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingTotalRickshaws ? 'Loading...' : totalRickshaws.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Overall vehicle inventory.
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm rounded-lg hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sold This Month</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingSoldThisMonth ? 'Loading...' : soldThisMonth.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              New plans created in {format(new Date(), 'MMMM yyyy')}.
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm rounded-lg hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingTotalCustomers ? 'Loading...' : totalCustomers.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              All registered customers.
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm rounded-lg hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingPlans ? 'Loading...' : `Rs ${totalRevenue.toLocaleString()}`}
            </div>
            <p className="text-xs text-muted-foreground">
              Cumulative value of all sales plans.
            </p>
          </CardContent>
        </Card>

        {/* New Metrics */}
        <Card className="border shadow-sm rounded-lg hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Investment This Month</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingCurrentMonthPurchases ? 'Loading...' : `Rs ${currentMonthInvestment.toLocaleString()}`}
            </div>
            <p className="text-xs text-muted-foreground">
              Total purchase cost of rickshaws acquired in {format(new Date(), 'MMMM yyyy')}.
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm rounded-lg hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profit This Month</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingPlans ? 'Loading...' : `Rs ${currentMonthProfit.toLocaleString()}`}
            </div>
            <p className="text-xs text-muted-foreground">
              Net profit from sales in {format(new Date(), 'MMMM yyyy')}.
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm rounded-lg hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Payments Received</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingAllPayments || loadingPlans ? 'Loading...' : `Rs ${totalPaymentsReceived.toLocaleString()}`}
            </div>
            <p className="text-xs text-muted-foreground">
              Total amount collected to date.
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm rounded-lg hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Remaining Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingAllPayments || loadingPlans ? 'Loading...' : `Rs ${totalRemainingBalance.toLocaleString()}`}
            </div>
            <p className="text-xs text-muted-foreground">
              Total outstanding balance across all plans.
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm rounded-lg hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue Installments</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {loadingPlans || loadingAllPayments ? 'Loading...' : overdueInstallmentsCount.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Active plans with missed payments.
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm rounded-lg hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Advance Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {loadingPlans || loadingAllPayments ? 'Loading...' : advancePendingCount.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Plans with uncollected initial advance.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Installments Table */}
      <Card className="border rounded-lg shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Upcoming Installments (Next 6 Months)
          </CardTitle>
          <CardDescription>
            Payments due in the near future, including monthly installments and pending advance amounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingPlans || loadingAllPayments ? (
            <div className="text-center py-8 text-muted-foreground">Loading upcoming installments...</div>
          ) : upcomingInstallments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No upcoming installments in the next 6 months.</div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer Name</TableHead>
                    <TableHead>Rickshaw</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Installment #</TableHead>
                    <TableHead>Amount Due</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcomingInstallments.map((item, index) => (
                    <TableRow key={`${item.planId}-${item.type}-${item.installmentNumber || 'advance'}-${index}`}>
                      <TableCell className="font-medium">{item.customerName}</TableCell>
                      <TableCell>{item.rikshawDetails}</TableCell>
                      <TableCell>{item.type === 'monthly' ? 'Monthly' : 'Advance Due'}</TableCell>
                      <TableCell>{item.installmentNumber || '-'}</TableCell>
                      <TableCell>Rs {item.amountDue.toLocaleString()}</TableCell>
                      <TableCell className={cn(
                        isBefore(parseISO(item.dueDate), new Date()) && item.status === 'overdue' ? 'text-red-600 font-semibold' : ''
                      )}>
                        {new Date(item.dueDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "px-2 py-1 rounded-full text-xs font-medium",
                          item.status === 'overdue' && "bg-red-100 text-red-800",
                          item.status === 'due' && "bg-blue-100 text-blue-800",
                        )}>
                          {item.status === 'overdue' ? 'Overdue' : 'Due'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
