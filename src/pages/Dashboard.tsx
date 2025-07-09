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
import { Car, Calendar, DollarSign, Check, ChevronDown, ChevronUp, Printer, Plus, X, Eye, Search, SortAsc, SortDesc, TrendingUp, AlertCircle, Clock, CheckCircle, Users, ShoppingCart, TrendingDown, Loader2 } from 'lucide-react';
import { format, addMonths, isBefore, isAfter, parseISO, startOfMonth, endOfMonth, eachMonthOfInterval, startOfYear, endOfYear, getMonth, getYear, addDays, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';

// Error Boundary Component (for robustness)
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error Boundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg" role="alert">
          <h2 className="text-xl font-bold text-red-800">Something went wrong</h2>
          <p className="mt-2 text-red-700">{this.state.error?.message || 'An unexpected error occurred'}</p>
          <Button
            className="mt-4"
            variant="destructive"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Interface definitions for data structures (re-used and updated)
interface Customer {
  id: string;
  name: string;
  address: string;
  cnic: string;
  phone: string;
  guarantor_name: string | null;
  guarantor_cnic: string | null;
  guarantor_phone: string | null;
  guarantor_address: string | null;
  bank_name: string | null;
  cheque_number: string | null;
}

interface Rikshaw {
  id: string;
  manufacturer: string;
  model_name: string;
  engine_number: string;
  chassis_number: string;
  registration_number: string | null;
  type: string;
  availability: 'sold' | 'unsold'; // 'sold', 'unsold'
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
  advance_paid: number; // Total advance amount collected at sale time (sum of initial advance_payments)
  advance_payments: AdvancePayment[]; // Array of initial individual advance payments made at sale time
  monthly_installment: number;
  duration_months: number;
  guarantor_name: string | null;
  guarantor_cnic: string | null;
  guarantor_phone: string | null;
  guarantor_address: string | null;
  bank_name: string | null;
  cheque_number: string | null;
  rikshaw_details: {
    manufacturer: string;
    model_name: string;
    engine_number: string;
    chassis_number: string;
    registration_number: string | null;
    type: string;
  };
  customers: Customer; // Nested customer details (only name, cnic needed for dashboard)
  rikshaws: Rikshaw; // Nested rikshaw details (updated to include purchase/sale price for profit)
  created_at: string; // Sale date
  agreement_date: string; // Added agreement_date
  total_paid_monthly_installments?: number | null; // Aggregate of only monthly payments
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

  const today = new Date();
  const currentMonthStart = format(startOfMonth(today), 'yyyy-MM-dd');
  const currentMonthEnd = format(endOfMonth(today), 'yyyy-MM-dd');

  // Fetch total rickshaws
  const { data: totalRickshaws = 0, isLoading: loadingTotalRickshaws } = useQuery<number>({
    queryKey: ['total-rikshaws'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('rikshaws')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count || 0;
    },
    staleTime: 5 * 60 * 1000,
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
    },
    staleTime: 5 * 60 * 1000,
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
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch all installment plans with necessary customer and rikshaw details for dashboard calculations
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
    },
    staleTime: 5 * 60 * 1000,
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
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch rickshaws purchased this month for investment calculation
  const { data: currentMonthPurchases = [], isLoading: loadingCurrentMonthPurchases } = useQuery<Rikshaw[]>({
    queryKey: ['current-month-purchases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rikshaws')
        .select('purchase_price') // Only need purchase_price for this calculation
        .gte('purchase_date', currentMonthStart)
        .lte('purchase_date', currentMonthEnd);
      if (error) throw error;
      return data as Rikshaw[];
    },
    staleTime: 5 * 60 * 1000,
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

  // Calculate total revenue (from all installment plans' total_price)
  const totalRevenue = useMemo(() => {
    return installmentPlans.reduce((sum, plan) => sum + plan.total_price, 0);
  }, [installmentPlans]);

  // Calculate total payments received (sum of all recorded payments and initial advance_paid from plans)
  const totalPaymentsReceived = useMemo(() => {
    // Sum of all 'advance_paid' from installment plans (representing the initial total advance for each sale)
    const initialAdvancesCollected = installmentPlans.reduce((sum, plan) => sum + plan.advance_paid, 0);

    // Sum of all recorded payments (monthly and advance adjustments)
    const recordedPayments = allInstallmentPayments.reduce((sum, payment) => sum + payment.amount_paid, 0);
    
    return initialAdvancesCollected + recordedPayments;
  }, [installmentPlans, allInstallmentPayments]);

  // Function to calculate remaining balance for a single plan (reused from InstallmentPage)
  const calculateRemainingBalance = useCallback((plan: InstallmentPlan, payments: InstallmentPayment[]) => {
    const totalAdvanceAdjustmentsCollected = payments.reduce((sum, p) => p.payment_type === 'advance_adjustment' ? sum + p.amount_paid : sum, 0);
    const totalMonthlyPaymentsReceived = payments.reduce((sum, p) => p.payment_type === 'monthly' ? sum + p.amount_paid : sum, 0);
    
    // Overall total paid includes the initial advance_paid from the plan itself (total agreed advance)
    const overallTotalPaid = plan.advance_paid + totalMonthlyPaymentsReceived + totalAdvanceAdjustmentsCollected;
    
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

  // Function to calculate plan status (reused from InstallmentPage)
  const getPlanStatus = useCallback((plan: InstallmentPlan, allPayments: InstallmentPayment[]) => {
    const paymentsForPlan = allPayments.filter(p => p.installment_plan_id === plan.id);

    // Use plan.advance_paid directly for total agreed advance
    const totalAgreedAdvance = plan.advance_paid;

    // Collected Advance: initial advance_paid + subsequent advance adjustments
    const totalAdvanceAdjustmentsCollected = paymentsForPlan.reduce((sum, p) => p.payment_type === 'advance_adjustment' ? sum + p.amount_paid : sum, 0);
    const collectedAdvance = totalAgreedAdvance + totalAdvanceAdjustmentsCollected;

    const totalMonthlyPaymentsReceived = paymentsForPlan.reduce((sum, p) => p.payment_type === 'monthly' ? sum + p.amount_paid : sum, 0);
    const overallTotalPaid = collectedAdvance + totalMonthlyPaymentsReceived;

    if (overallTotalPaid >= plan.total_price) {
      return 'Completed';
    }

    // Remaining initial advance due (assuming advance_payments[0] is the primary initial lump sum if multiple were allowed at sale time)
    // If advance_paid is truly the sum of all initial chunks, then remainingAgreedAdvanceDue would be totalAgreedAdvance - (sum of recorded advance payments up to agreement date)
    // For simplicity and consistency with previous page's 'SellRickshaw' logic (where 'advance_paid' is the sum of 'advance_payments'),
    // we'll check if the *initial total advance* has been fully collected by comparing against plan.advance_paid directly.
    const initialAdvancePaymentsActuallyRecorded = plan.advance_payments.reduce((sum, p) => sum + p.amount, 0);
    if (initialAdvancePaymentsActuallyRecorded < totalAgreedAdvance) {
        return 'Advance Pending';
    }


    const agreementDate = parseISO(plan.agreement_date); // Use agreement_date for schedule
    let installmentsDueCount = 0;
    for (let i = 1; i <= plan.duration_months; i++) {
      const dueDate = addMonths(agreementDate, i);
      if (isBefore(dueDate, today) || format(dueDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) {
        installmentsDueCount++;
      } else {
        break;
      }
    }

    const expectedMonthlyPaid = installmentsDueCount * plan.monthly_installment;

    if (totalMonthlyPaymentsReceived < expectedMonthlyPaid && installmentsDueCount > 0) {
      return 'Overdue';
    } else if (totalMonthlyPaymentsReceived >= expectedMonthlyPaid && installmentsDueCount > 0) {
      return 'Active';
    }

    return 'Not Active'; // For plans where no installments are due yet
  }, [today]);

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

    const salesThisMonthPlans = installmentPlans.filter(plan => {
      const planCreatedAt = parseISO(plan.created_at);
      return planCreatedAt.getMonth() === today.getMonth() && planCreatedAt.getFullYear() === today.getFullYear();
    });

    salesThisMonthPlans.forEach(plan => {
      if (plan.rikshaws) {
        totalSalePrice += plan.rikshaws.sale_price || 0;
        totalPurchasePrice += plan.rikshaws.purchase_price || 0;
      }
    });
    return totalSalePrice - totalPurchasePrice;
  }, [installmentPlans, loadingPlans, today]);


  // Generate upcoming installments for the next 7 days (including today)
  const upcomingInstallments = useMemo(() => {
    if (loadingPlans || loadingAllPayments) return [];

    const upcoming: UpcomingInstallment[] = [];
    const sevenDaysFromNow = addDays(startOfDay(today), 7); // Include today and next 6 days

    installmentPlans.forEach(plan => {
      const paymentsForPlan = allInstallmentPayments.filter(p => p.installment_plan_id === plan.id);

      // Check for remaining advance due (if any of the initial chunks are still not paid)
      // This is a simplified check: if plan.advance_paid (the total agreed advance) is not fully covered
      // by the sum of initial advance_payments array, it's considered pending.
      const initialAdvancePaymentsActuallyRecorded = plan.advance_payments.reduce((sum, p) => sum + p.amount, 0);
      const remainingInitialAdvanceToCollect = plan.advance_paid - initialAdvancePaymentsActuallyRecorded;
      
      if (remainingInitialAdvanceToCollect > 0) {
        upcoming.push({
          planId: plan.id,
          customerName: plan.customers.name,
          rikshawDetails: `${plan.rikshaws.model_name} (${plan.rikshaws.registration_number || 'N/A'})`,
          type: 'advance',
          amountDue: remainingInitialAdvanceToCollect,
          dueDate: format(parseISO(plan.agreement_date), 'yyyy-MM-dd'), // Use agreement date as a reference or a more precise future date if available for advance
          status: 'overdue', // Consider pending initial advance as overdue if not collected on agreement date
        });
      }

      // Generate monthly schedule and find upcoming ones
      const agreementDate = parseISO(plan.agreement_date);
      const paymentsByInstallment: Record<number, number> = {};
      paymentsForPlan
        .filter(p => p.payment_type === 'monthly' && p.installment_number !== null)
        .forEach(p => {
          if (p.installment_number) {
            paymentsByInstallment[p.installment_number] = (paymentsByInstallment[p.installment_number] || 0) + p.amount_paid;
          }
        });

      for (let i = 1; i <= plan.duration_months; i++) {
        const dueDate = addMonths(agreementDate, i);
        const paidAmount = paymentsByInstallment[i] || 0;
        const expectedAmount = plan.monthly_installment;

        if (paidAmount < expectedAmount) {
          const amountRemainingForInstallment = expectedAmount - paidAmount;
          let status: 'due' | 'overdue' = 'due';

          // An installment is overdue if its due date is before today AND there's an amount remaining
          if (isBefore(dueDate, startOfDay(today)) && amountRemainingForInstallment > 0) {
            status = 'overdue';
          }
          
          // Only include if it's overdue, or if due date is within the next 7 days (including today)
          if (status === 'overdue' || (isAfter(dueDate, startOfDay(today)) && isBefore(dueDate, sevenDaysFromNow)) || format(dueDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) {
            upcoming.push({
              planId: plan.id,
              customerName: plan.customers.name,
              rikshawDetails: `${plan.rikshaws.model_name} (${plan.rikshaws.registration_number || 'N/A'})`,
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
  }, [installmentPlans, allInstallmentPayments, loadingPlans, loadingAllPayments, today]);


  return (
    <ErrorBoundary>
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
                {loadingTotalRickshaws ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : totalRickshaws.toLocaleString()}
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
                {loadingSoldThisMonth ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : soldThisMonth.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                New plans created in {format(today, 'MMMM yyyy')}.
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
                {loadingTotalCustomers ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : totalCustomers.toLocaleString()}
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
                {loadingPlans ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : `Rs ${totalRevenue.toLocaleString()}`}
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
                {loadingCurrentMonthPurchases ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : `Rs ${currentMonthInvestment.toLocaleString()}`}
              </div>
              <p className="text-xs text-muted-foreground">
                Total purchase cost of rickshaws acquired in {format(today, 'MMMM yyyy')}.
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
                {loadingPlans ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : `Rs ${currentMonthProfit.toLocaleString()}`}
              </div>
              <p className="text-xs text-muted-foreground">
                Net profit from sales in {format(today, 'MMMM yyyy')}.
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
                {(loadingAllPayments || loadingPlans) ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : `Rs ${totalPaymentsReceived.toLocaleString()}`}
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
                {(loadingAllPayments || loadingPlans) ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : `Rs ${totalRemainingBalance.toLocaleString()}`}
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
                {(loadingPlans || loadingAllPayments) ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : overdueInstallmentsCount.toLocaleString()}
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
                {(loadingPlans || loadingAllPayments) ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : advancePendingCount.toLocaleString()}
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
              Upcoming Installments (Next 7 Days & Overdue)
            </CardTitle>
            <CardDescription>
              Payments that are overdue or due in the upcoming week, including monthly installments and pending advance amounts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(loadingPlans || loadingAllPayments) ? (
              <div className="text-center py-8 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                Loading upcoming installments...
              </div>
            ) : upcomingInstallments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No upcoming installments in the next 7 days or overdue.</div>
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
                          isBefore(parseISO(item.dueDate), startOfDay(today)) && item.status === 'overdue' ? 'text-red-600 font-semibold' : ''
                        )}>
                          {new Date(item.dueDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <span className={cn(
                            "px-2 py-1 rounded-full text-xs font-medium",
                            item.status === 'overdue' && "bg-red-100 text-red-800",
                            item.status === 'due' && "bg-blue-100 text-blue-800",
                          )}>
                            {item.status === 'overdue' ? 'Overdue' : 'Due Soon'}
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
    </ErrorBoundary>
  );
};

export default Dashboard;