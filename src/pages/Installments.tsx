import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Car, Calendar, DollarSign, Check, ChevronDown, ChevronUp, Printer, Plus, X, Eye, Search, SortAsc, SortDesc, Edit, Save, Loader2 } from 'lucide-react';
import { format, addMonths, isBefore, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

// Interface definitions for data structures
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
  registration_number: string;
  type: string;
  availability: string; // 'sold', 'available'
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
  rikshaws: Rikshaw; // Nested rikshaw details
  created_at: string; // Sale date
  agreement_date: string; // Added agreement_date
  total_paid_monthly_installments?: number; // Aggregate of only monthly payments
  // 🛑 Added Commission Fields
  showroom_commission?: number;
  is_commission_paid?: boolean;
}

interface InstallmentPayment {
  id: string;
  installment_plan_id: string;
  payment_date: string; // ISO string 'YYYY-MM-DD'
  amount_paid: number;
  received_by: string;
  payment_type: 'monthly' | 'advance_adjustment' | 'commission' | 'discount'; // 🛑 Added 'discount' type
  installment_number?: number | null; // New field for monthly installment number
  created_at: string;
}

// Main InstallmentPage Component
const InstallmentPage = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State for search, sort, and detail view
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  // Fetch all installment plans with customer and rikshaw details
  const { data: installmentPlans = [], isLoading: loadingPlans, error: plansError } = useQuery<InstallmentPlan[]>({
    queryKey: ['installment-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('installment_plans')
        .select(`
          *,
          customers!inner (name, cnic, phone, address, guarantor_name, guarantor_cnic, guarantor_phone, guarantor_address, bank_name, cheque_number),
          rikshaws!inner (manufacturer, model_name, registration_number, engine_number, chassis_number, type)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as InstallmentPlan[];
    }
  });

  // Fetch all payments for all plans for status calculation
  const { data: allInstallmentPayments = [], isLoading: loadingAllPayments, error: allPaymentsError } = useQuery<InstallmentPayment[]>({
    queryKey: ['all-installment-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('installment_payments')
        .select('*');
      if (error) throw error;
      return data as InstallmentPayment[];
    }
  });

  // Handle errors for fetching plans and payments
  useEffect(() => {
    if (plansError) {
      toast({
        title: "Error fetching installment plans",
        description: plansError.message,
        variant: "destructive",
      });
    }
  }, [plansError, toast]);

  useEffect(() => {
    if (allPaymentsError) {
      toast({
        title: "Error fetching all payments",
        description: allPaymentsError.message,
        variant: "destructive",
      });
    }
  }, [allPaymentsError, toast]);

  // Function to calculate plan status
  const getPlanStatus = useCallback((plan: InstallmentPlan, allPayments: InstallmentPayment[]) => {
    const paymentsForPlan = allPayments.filter(p => p.installment_plan_id === plan.id);

    // Sum of all initial advance payments (Total Agreed Advance)
    const totalAgreedAdvance = plan.advance_payments.reduce((sum, p) => sum + p.amount, 0);

    // Collected Advance: initial first advance payment + subsequent advance adjustments
    const initialFirstAdvance = plan.advance_payments[0]?.amount || 0;
    const totalAdvanceAdjustmentsCollected = paymentsForPlan.reduce((sum, p) => p.payment_type === 'advance_adjustment' ? sum + p.amount_paid : sum, 0);
    const collectedAdvance = initialFirstAdvance + totalAdvanceAdjustmentsCollected;

    const totalMonthlyPaymentsReceived = paymentsForPlan.reduce((sum, p) => p.payment_type === 'monthly' ? sum + p.amount_paid : sum, 0);
    const totalDiscountApplied = paymentsForPlan.reduce((sum, p) => p.payment_type === 'discount' ? sum + p.amount_paid : sum, 0); // 🛑 Added Discount calculation

    // Total payments that count against the customer's debt
    const totalCustomerPayments = initialFirstAdvance + totalMonthlyPaymentsReceived + totalAdvanceAdjustmentsCollected + totalDiscountApplied; 


    if (totalCustomerPayments >= plan.total_price) { // Check against total customer payments
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

  // Filter and sort installment plans
  const filteredAndSortedPlans = useMemo(() => {
    if (loadingAllPayments) return [];

    let filtered = installmentPlans.filter((plan: InstallmentPlan) => {
      const customerName = plan.customers?.name?.toLowerCase() || '';
      const customerCnic = plan.customers?.cnic?.toLowerCase() || '';
      const rikshawRegNo = plan.rikshaws?.registration_number?.toLowerCase() || '';
      const rikshawEngineNo = plan.rikshaws?.engine_number?.toLowerCase() || ''; // Added engine number
      const term = searchTerm.toLowerCase();
      return customerName.includes(term) || customerCnic.includes(term) || rikshawRegNo.includes(term) || rikshawEngineNo.includes(term); // Updated search
    });

    filtered.sort((a: InstallmentPlan, b: InstallmentPlan) => {
      let valA: any, valB: any;
      if (sortBy === 'customer_name') {
        valA = a.customers?.name?.toLowerCase();
        valB = b.customers?.name?.toLowerCase();
      } else if (sortBy === 'rikshaw_reg_no') {
        valA = a.rikshaws?.registration_number?.toLowerCase();
        valB = b.rikshaws?.registration_number?.toLowerCase();
      } else {
        valA = (a as any)[sortBy];
        valB = (b as any)[sortBy];
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });

    return filtered;
  }, [installmentPlans, searchTerm, sortBy, sortOrder, loadingAllPayments]);

  // Open detail modal
  const handleViewDetails = (planId: string) => {
    setSelectedPlanId(planId);
    setShowDetailModal(true);
  };

  const calculateRemainingBalance = useCallback((plan: InstallmentPlan, payments: InstallmentPayment[]) => {
    const initialFirstAdvance = plan.advance_payments[0]?.amount || 0;
    const totalMonthlyPaymentsReceived = payments.reduce((sum, p) => p.payment_type === 'monthly' ? sum + p.amount_paid : sum, 0);
    const totalAdvanceAdjustmentsCollected = payments.reduce((sum, p) => p.payment_type === 'advance_adjustment' ? sum + p.amount_paid : sum, 0);
    const totalDiscountApplied = payments.reduce((sum, p) => p.payment_type === 'discount' ? sum + p.amount_paid : sum, 0); // 🛑 Added Discount

    const overallCustomerPaid = initialFirstAdvance + totalMonthlyPaymentsReceived + totalAdvanceAdjustmentsCollected + totalDiscountApplied; // Includes discount
    
    // Commission Calculation
    const totalCommissionPaid = payments.reduce((sum, p) => p.payment_type === 'commission' ? sum + p.amount_paid : sum, 0);
    const totalOutstandingCommission = (plan.showroom_commission || 0) - totalCommissionPaid;
    
    const customerDebt = plan.total_price - overallCustomerPaid;
    
    // Remaining Balance = Customer Debt + Outstanding Commission
    return customerDebt + totalOutstandingCommission;
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800">Rickshaw Installment Plans</h1>
        <p className="text-muted-foreground mt-2">
          Manage and track all customer installment plans.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Installment Plans Overview
          </CardTitle>
          <CardDescription>
            Browse, search, and manage all active and completed installment plans.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by customer name, CNIC, rickshaw registration, or engine number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 rounded-md border"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="sort-by" className="sr-only">Sort By</Label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger id="sort-by" className="w-[180px]">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Date Created</SelectItem>
                  <SelectItem value="customer_name">Customer Name</SelectItem>
                  <SelectItem value="rikshaw_reg_no">Rickshaw Reg No</SelectItem>
                  <SelectItem value="total_price">Total Price</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              >
                {sortOrder === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {loadingPlans || loadingAllPayments ? (
            <div className="text-center py-8 text-muted-foreground">Loading installment plans...</div>
          ) : filteredAndSortedPlans.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No installment plans found.</div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer Name</TableHead>
                    <TableHead>Rickshaw Details</TableHead>
                    <TableHead>Total Price</TableHead>
                    
                    <TableHead>Monthly Installment</TableHead>
                    <TableHead>Remaining Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedPlans.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell className="font-medium">{plan.customers?.name}</TableCell>
                      <TableCell>
                        {plan.rikshaws?.model_name} ({plan.rikshaws?.registration_number})
                      </TableCell>
                      <TableCell>Rs {plan.total_price?.toLocaleString()}</TableCell>
                      
                      <TableCell>Rs {plan.monthly_installment?.toLocaleString()}</TableCell>
                      <TableCell>
                        Rs {calculateRemainingBalance(plan, allInstallmentPayments.filter(p => p.installment_plan_id === plan.id))?.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "px-2 py-1 rounded-full text-xs font-medium",
                          getPlanStatus(plan, allInstallmentPayments) === 'Completed' && "bg-green-100 text-green-800",
                          getPlanStatus(plan, allInstallmentPayments) === 'Active' && "bg-blue-100 text-blue-800",
                          getPlanStatus(plan, allInstallmentPayments) === 'Overdue' && "bg-red-100 text-red-800",
                          getPlanStatus(plan, allInstallmentPayments) === 'Advance Pending' && "bg-yellow-100 text-yellow-800",
                          getPlanStatus(plan, allInstallmentPayments) === 'Not Active' && "bg-gray-100 text-gray-800",
                        )}>
                          {getPlanStatus(plan, allInstallmentPayments)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDetails(plan.id)}
                          className="flex items-center gap-1"
                        >
                          <Eye className="h-4 w-4" /> View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Installment Detail Modal */}
      {selectedPlanId && (
        <InstallmentDetailModal
          planId={selectedPlanId}
          isOpen={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedPlanId(null);
          }}
        />
      )}
    </div>
  );
};

// Installment Detail Modal Component
interface InstallmentDetailModalProps {
  planId: string;
  isOpen: boolean;
  onClose: () => void;
}

const InstallmentDetailModal: React.FC<InstallmentDetailModalProps> = ({ planId, isOpen, onClose }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showRecordPaymentForm, setShowRecordPaymentForm] = useState(false);
  const [paymentType, setPaymentType] = useState<'monthly' | 'advance_adjustment' | 'commission' | 'discount'>('monthly'); // 🛑 Updated type
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [receivedBy, setReceivedBy] = useState('');
  const [installmentNumber, setInstallmentNumber] = useState<number | null>(null);
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);

  // State for editing payments
  const [editingPayment, setEditingPayment] = useState<InstallmentPayment | null>(null);
  const [showEditPaymentModal, setShowEditPaymentModal] = useState(false);
  const [editedAmountPaid, setEditedAmountPaid] = useState<number>(0);
  const [editedPaymentDate, setEditedPaymentDate] = useState('');
  const [editedReceivedBy, setEditedReceivedBy] = useState('');
  const [editedPaymentType, setEditedPaymentType] = useState<'monthly' | 'advance_adjustment' | 'commission' | 'discount'>('monthly'); // 🛑 Updated type
  const [editedInstallmentNumber, setEditedInstallmentNumber] = useState<number | null>(null);

  // State for editing plan details
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [editedTotalPrice, setEditedTotalPrice] = useState<number>(0);
  const [editedAdvanceAgreed, setEditedAdvanceAgreed] = useState<number>(0); // This is plan.advance_payments[0].amount
  const [editedMonthlyInstallment, setEditedMonthlyInstallment] = useState<number>(0);
  const [editedDurationMonths, setEditedDurationMonths] = useState<number>(0);


  // Fetch specific installment plan details
  const { data: planDetails, isLoading: loadingPlanDetails, error: planDetailsError } = useQuery<InstallmentPlan>({
    queryKey: ['installment-plan-details', planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('installment_plans')
        .select(`
          *,
          customers!inner (name, cnic, phone, address, guarantor_name, guarantor_cnic, guarantor_phone, guarantor_address, bank_name, cheque_number),
          rikshaws!inner (manufacturer, model_name, registration_number, engine_number, chassis_number, type)
        `)
        .eq('id', planId)
        .single();
      if (error) throw error;
      return data as InstallmentPlan;
    },
    enabled: isOpen && !!planId,
  });

  // Fetch payments for the selected plan
  const { data: installmentPayments = [], isLoading: loadingPayments, error: paymentsError } = useQuery<InstallmentPayment[]>({
    queryKey: ['installment-payments', planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('installment_payments')
        .select('*')
        .eq('installment_plan_id', planId)
        .order('payment_date', { ascending: true });
      if (error) throw error;
      return data as InstallmentPayment[];
    },
    enabled: isOpen && !!planId,
  });

  // Handle errors
  useEffect(() => {
    if (planDetailsError) {
      toast({
        title: "Error fetching plan details",
        description: planDetailsError.message,
        variant: "destructive",
      });
    }
  }, [planDetailsError, toast]);

  useEffect(() => {
    if (paymentsError) {
      toast({
        title: "Error fetching payments",
        description: paymentsError.message,
        variant: "destructive",
      });
    }
  }, [paymentsError, toast]);

  // Initialize edited plan details when planDetails loads or changes
  useEffect(() => {
    if (planDetails) {
      setEditedTotalPrice(planDetails.total_price);
      setEditedAdvanceAgreed(planDetails.advance_payments[0]?.amount || 0); // Use the first advance payment as 'agreed'
      setEditedMonthlyInstallment(planDetails.monthly_installment);
      setEditedDurationMonths(planDetails.duration_months);
    }
  }, [planDetails]);


  // Calculate total agreed advance payments (sum of all initial advance payments)
  const totalAgreedAdvance = useMemo(() => {
    if (!planDetails || !planDetails.advance_payments) return 0;
    return planDetails.advance_payments.reduce((sum, p) => sum + p.amount, 0);
  }, [planDetails]);

  // Calculate collected advance: initial first advance payment + subsequent advance adjustments
  const collectedAdvance = useMemo(() => {
    if (!planDetails) return 0;
    const initialFirstAdvance = planDetails.advance_payments[0]?.amount || 0;
    const totalAdvanceAdjustmentsCollected = installmentPayments.reduce((sum, p) => p.payment_type === 'advance_adjustment' ? sum + p.amount_paid : sum, 0);
    return initialFirstAdvance + totalAdvanceAdjustmentsCollected;
  }, [planDetails, installmentPayments]);

  const remainingAgreedAdvanceDue = useMemo(() => {
    return totalAgreedAdvance - collectedAdvance;
  }, [totalAgreedAdvance, collectedAdvance]);


  const totalMonthlyPaymentsReceived = useMemo(() => {
    return installmentPayments.reduce((sum, p) => p.payment_type === 'monthly' ? sum + p.amount_paid : sum, 0);
  }, [installmentPayments]);

  const totalDiscountApplied = useMemo(() => {
    // 🛑 New Memo: Calculate total discount applied
    return installmentPayments.reduce((sum, p) => p.payment_type === 'discount' ? sum + p.amount_paid : sum, 0);
  }, [installmentPayments]);
  
  const totalCommissionPaid = useMemo(() => {
    // 🛑 COMMISSION: Calculated total commission paid for display purposes only
    return installmentPayments.reduce((sum, p) => p.payment_type === 'commission' ? sum + p.amount_paid : sum, 0);
  }, [installmentPayments]);

  const overallCustomerPaid = useMemo(() => {
    // 🛑 LOGIC FIX: Include discount payments in the customer's total paid
    return collectedAdvance + totalMonthlyPaymentsReceived + totalDiscountApplied;
  }, [collectedAdvance, totalMonthlyPaymentsReceived, totalDiscountApplied]);

  // 🛑 New Memo: Calculate total outstanding commission (Commission Owed - Commission Paid)
  const totalOutstandingCommission = useMemo(() => {
    if (!planDetails) return 0;
    return (planDetails.showroom_commission || 0) - totalCommissionPaid;
  }, [planDetails, totalCommissionPaid]);

  const remainingBalanceOnPlan = useMemo(() => {
    if (!planDetails) return 0;
    // 🛑 MODIFIED LOGIC (User Request): Remaining balance is the Customer Debt (Total Price - Customer Paid) PLUS the Outstanding Showroom Commission.
    const customerDebt = planDetails.total_price - overallCustomerPaid;
    return customerDebt + totalOutstandingCommission;
  }, [planDetails, overallCustomerPaid, totalOutstandingCommission]);

  // Generate monthly installment schedule with payment status
  const monthlySchedule = useMemo(() => {
    if (!planDetails) return [];
    const schedule = [];
    // Use agreement_date instead of created_at for saleDate
    const saleDate = parseISO(planDetails.agreement_date);

    // Create a map of payments by installment number
    const paymentsByInstallment: Record<number, number> = {};
    installmentPayments
      .filter(p => p.payment_type === 'monthly' && p.installment_number !== null)
      .forEach(p => {
        if (p.installment_number) {
          paymentsByInstallment[p.installment_number] = (paymentsByInstallment[p.installment_number] || 0) + p.amount_paid;
        }
      });

    for (let i = 1; i <= planDetails.duration_months; i++) {
      const dueDate = addMonths(saleDate, i);
      const paidAmount = paymentsByInstallment[i] || 0;
      const isPaid = paidAmount >= planDetails.monthly_installment;
      const isPartiallyPaid = paidAmount > 0 && paidAmount < planDetails.monthly_installment;

      schedule.push({
        installment_number: i,
        due_date: format(dueDate, 'yyyy-MM-dd'),
        expected_amount: planDetails.monthly_installment,
        paid_amount: paidAmount,
        status: isPaid ? 'Paid' : isPartiallyPaid ? 'Partially Paid' : 'Unpaid'
      });
    }
    return schedule;
  }, [planDetails, installmentPayments]);

  // Available installments for payment selection (No longer used for input, but kept for context)
  const availableInstallments = useMemo(() => {
    if (!planDetails) return [];
    return monthlySchedule.filter(
      item => item.status !== 'Paid' && item.expected_amount > item.paid_amount
    ).map(item => item.installment_number);
  }, [monthlySchedule, planDetails]);

  // Function to generate and print a payment receipt
  const generatePaymentReceipt = useCallback((payment: InstallmentPayment, finalRemainingBalance: number) => {
    if (!planDetails) {
      toast({ title: "Error", description: "Plan details not available for receipt.", variant: "destructive" });
      return;
    }

    const getPaymentTypeName = (type: 'monthly' | 'advance_adjustment' | 'commission' | 'discount') => {
      switch (type) {
        case 'monthly':
          return 'Monthly Installment';
        case 'advance_adjustment':
          return 'Advance Adjustment';
        case 'commission':
          return 'Showroom Commission';
        case 'discount': // 🛑 Added 'discount' case
          return 'Discount / Early Payoff';
        default:
          return 'Payment';
      }
    };

    const receiptContent = `
      <div style="font-family: 'Inter', sans-serif; padding: 10px; width: 100%; box-sizing: border-box; font-size: 10px; line-height: 1.4;">
        <style>
          @media print {
            body { margin: 0; padding: 0; }
            .receipt-container {
              width: 100%; /* Take full width of the print area */
              height: 148.5mm; /* Approximately 1/2 A4 height (297mm / 2) */
              margin: 0;
              padding: 10px;
              box-sizing: border-box;
              border: 1px solid #ccc; /* Optional: for visual separation */
            }
            .no-print { display: none; }
          }
        </style>
        <div class="receipt-container">
          <div style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 5px; margin-bottom: 10px;">
            <h2 style="margin: 0; font-size: 14px; color: #333;">AL-HAMD TRADERS</h2>
            <p style="margin: 0; font-size: 8px; color: #666;">Railway Road Chowk Shamah, Sargodha</p>
          </div>
          <p style="text-align: center; font-weight: bold; margin-bottom: 10px; font-size: 11px;">PAYMENT RECEIPT</p>
          <p style="margin-bottom: 5px;"><strong>Date:</strong> ${new Date(payment.payment_date).toLocaleDateString()}</p>
          <p style="margin-bottom: 10px;"><strong>Receipt No:</strong> ${payment.id.substring(0, 8).toUpperCase()}</p>

          <div style="margin-bottom: 10px; border: 1px dashed #ccc; padding: 5px;">
            <p style="margin: 0; font-weight: bold;">Customer Details:</p>
            <p style="margin: 0;"><strong>Name:</strong> ${planDetails.customers?.name}</p>
            <p style="margin: 0;"><strong>Phone:</strong> ${planDetails.customers?.phone}</p>
          </div>

          <div style="margin-bottom: 10px; border: 1px dashed #ccc; padding: 5px;">
            <p style="margin: 0; font-weight: bold;">Rickshaw Details:</p>
            <p style="margin: 0;"><strong>Manufacturer:</strong> ${planDetails.rikshaws?.manufacturer}</p>
            <p style="margin: 0;"><strong>Reg No:</strong> ${planDetails.rikshaws?.registration_number}</p>
            <p style="margin: 0;"><strong>Engine No:</strong> ${planDetails.rikshaws?.engine_number}</p>
          </div>

          <div style="margin-bottom: 10px;">
            <p style="margin: 0;"><strong>Payment Type:</strong> ${getPaymentTypeName(payment.payment_type)}</p>
            ${payment.payment_type === 'monthly' && payment.installment_number ? `<p style="margin: 0;"><strong>Installment #:</strong> ${payment.installment_number}</p>` : ''}
          </div>

          <div style="margin-bottom: 10px; font-size: 12px; font-weight: bold; text-align: center; padding: 5px; background-color: #e0ffe0; border-radius: 3px;">
            <p style="margin: 0;">Amount Received: Rs ${payment.amount_paid.toLocaleString()}</p>
          </div>

          <div style="margin-bottom: 10px; text-align: center; border-top: 1px solid #eee; padding-top: 5px;">
            <p style="margin: 0;"><strong>Remaining Balance:</strong> Rs ${finalRemainingBalance.toLocaleString()}</p>
          </div>

          <p style="margin: 0; text-align: right; font-size: 9px;">Received By: ${payment.received_by}</p>
          <p style="margin: 0; text-align: center; font-size: 8px; margin-top: 10px;">Thank You!</p>
        </div>
      </div>
    `;

    const printWindow = window.open('', '_blank'); // Open in new tab
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Payment Receipt</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
            <style>
              body { font-family: 'Inter', sans-serif; margin: 0; padding: 0; }
              @page { size: A4; margin: 0; } /* Set page size to A4 and remove margins */
            </style>
          </head>
          <body>
            ${receiptContent}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print(); // Trigger print dialog
    }
  }, [planDetails, toast]);


  // Mutation to record a new payment
  const recordPaymentMutation = useMutation({
    mutationFn: async (newPayment: {
      installment_plan_id: string;
      payment_date: string;
      amount_paid: number;
      received_by: string;
      payment_type: 'monthly' | 'advance_adjustment' | 'commission' | 'discount'; // 🛑 Updated type
      installment_number?: number | null;
    }) => {
      setIsRecordingPayment(true);
      const { data, error } = await supabase
        .from('installment_payments')
        .insert([newPayment])
        .select()
        .single();
      if (error) throw error;

      // COMMISSION LOGIC: If commission is paid, update the flag on the plan
      if (newPayment.payment_type === 'commission') {
        await supabase
          .from('installment_plans')
          .update({ is_commission_paid: true })
          .eq('id', planId);
      }

      // Update total_paid_monthly_installments if it's a monthly payment
      if (newPayment.payment_type === 'monthly') {
        const { data: currentPlan, error: fetchPlanError } = await supabase
          .from('installment_plans')
          .select('total_paid_monthly_installments')
          .eq('id', planId)
          .single();

        if (!fetchPlanError) {
          const updatedTotalPaidMonthly = (currentPlan?.total_paid_monthly_installments || 0) + newPayment.amount_paid;
          await supabase
            .from('installment_plans')
            .update({ total_paid_monthly_installments: updatedTotalPaidMonthly })
            .eq('id', planId);
        }
      }

      return data;
    },
    onSuccess: (data) => {
      // Invalidate queries to trigger re-fetch and UI update
      queryClient.invalidateQueries({ queryKey: ['installment-payments', planId] });
      queryClient.invalidateQueries({ queryKey: ['installment-plan-details', planId] });
      queryClient.invalidateQueries({ queryKey: ['installment-plans'] });
      queryClient.invalidateQueries({ queryKey: ['all-installment-payments'] });

      toast({
        title: "Payment Recorded!",
        description: `Rs ${amountPaid.toLocaleString()} received for ${data.payment_type.replace('_', ' ')}.`,
      });

      // Calculate the remaining balance for the receipt immediately after the new payment.
      // The remainingBalanceOnPlan is the total of customer debt + outstanding commission, 
      // so any payment (customer or commission) reduces this overall debt.
      const newRemainingBalanceForReceipt = remainingBalanceOnPlan - data.amount_paid;
      
      generatePaymentReceipt(data, newRemainingBalanceForReceipt); // Pass the new remaining balance

      setShowRecordPaymentForm(false);
      setAmountPaid(0);
      setReceivedBy('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setInstallmentNumber(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error recording payment",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => setIsRecordingPayment(false)
  });

  // Mutation to update an existing payment
  const updatePaymentMutation = useMutation({
    mutationFn: async (updatedPayment: InstallmentPayment) => {
      const { data, error } = await supabase
        .from('installment_payments')
        .update({
          payment_date: updatedPayment.payment_date,
          amount_paid: updatedPayment.amount_paid,
          received_by: updatedPayment.received_by,
          payment_type: updatedPayment.payment_type,
          installment_number: updatedPayment.installment_number
        })
        .eq('id', updatedPayment.id)
        .select()
        .single();
      if (error) throw error;

      // COMMISSION LOGIC for update: If updating an old payment to 'commission'
      if (updatedPayment.payment_type === 'commission') {
         await supabase
            .from('installment_plans')
            .update({ is_commission_paid: true })
            .eq('id', planId);
      }
      // Note: Reverting a commission payment to non-commission status would require 
      // complex logic to reset the flag, which is omitted for simplicity but is a business consideration.


      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installment-payments', planId] });
      queryClient.invalidateQueries({ queryKey: ['installment-plan-details', planId] });
      queryClient.invalidateQueries({ queryKey: ['installment-plans'] });
      queryClient.invalidateQueries({ queryKey: ['all-installment-payments'] });
      toast({
        title: "Payment Updated!",
        description: "Payment details have been successfully updated.",
      });
      setShowEditPaymentModal(false);
      setEditingPayment(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error updating payment",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Mutation to update the installment plan details (omitted for brevity, no change needed)
  const updateInstallmentPlanMutation = useMutation({
     mutationFn: async (updatedPlan: {
       total_price: number;
       advance_paid: number; 
       monthly_installment: number;
       duration_months: number;
     }) => {
       // Fetch the current advance_payments array
       const { data: currentPlanData, error: fetchError } = await supabase
         .from('installment_plans')
         .select('advance_payments')
         .eq('id', planId)
         .single();

       if (fetchError) throw fetchError;

       const currentAdvancePayments = currentPlanData?.advance_payments || [];
       const updatedAdvancePayments = [...currentAdvancePayments];

       // Update the first advance payment amount if it exists
       if (updatedAdvancePayments.length > 0) {
         updatedAdvancePayments[0] = {
           ...updatedAdvancePayments[0],
           amount: updatedPlan.advance_paid,
         };
       } else {
         // If no advance payments exist, add one with today's date
         updatedAdvancePayments.push({
           amount: updatedPlan.advance_paid,
           date: format(new Date(), 'yyyy-MM-dd'),
         });
       }


       const { data, error } = await supabase
         .from('installment_plans')
         .update({
           total_price: updatedPlan.total_price,
           advance_paid: updatedPlan.advance_paid,
           advance_payments: updatedAdvancePayments, // Update the JSONB array
           monthly_installment: updatedPlan.monthly_installment,
           duration_months: updatedPlan.duration_months,
         })
         .eq('id', planId)
         .select()
         .single();

       if (error) throw error;
       return data;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['installment-plan-details', planId] });
       queryClient.invalidateQueries({ queryKey: ['installment-plans'] });
       queryClient.invalidateQueries({ queryKey: ['all-installment-payments'] }); // Important for overall status recalculation
       toast({
         title: "Plan Updated!",
         description: "Installment plan details have been successfully updated.",
       });
       setIsEditingPlan(false); // Exit edit mode
     },
     onError: (error: any) => {
       toast({
         title: "Error updating plan",
         description: error.message,
         variant: "destructive",
       });
     }
   });


  // Handle recording payment submission
  const handleRecordPayment = () => {
    if (!planDetails) {
      toast({ title: "Error", description: "Plan details not loaded.", variant: "destructive" });
      return;
    }
    if (amountPaid <= 0) {
      toast({ title: "Error", description: "Amount paid must be greater than 0.", variant: "destructive" });
      return;
    }
    if (!paymentDate) {
      toast({ title: "Error", description: "Payment date is required.", variant: "destructive" });
      return;
    }
    if (!receivedBy.trim()) {
      toast({ title: "Error", description: "Received by name is required.", variant: "destructive" });
      return;
    }
    // 🛑 VALIDATION: Check installment number only if payment is monthly
    if (paymentType === 'monthly' && (installmentNumber === null || installmentNumber <= 0)) {
      toast({ title: "Error", description: "Please enter a valid installment number (e.g., 1, 2).", variant: "destructive" });
      return;
    }

    recordPaymentMutation.mutate({
      installment_plan_id: planId,
      payment_date: paymentDate,
      amount_paid: amountPaid,
      received_by: receivedBy.trim(),
      payment_type: paymentType,
      installment_number: paymentType === 'monthly' ? installmentNumber : null
    });
  };

  // Handle edit payment submission
  const handleEditPaymentSubmit = () => {
    if (!editingPayment) return;

    if (editedAmountPaid <= 0) {
      toast({ title: "Error", description: "Amount paid must be greater than 0.", variant: "destructive" });
      return;
    }
    if (!editedPaymentDate) {
      toast({ title: "Error", description: "Payment date is required.", variant: "destructive" });
      return;
    }
    if (!editedReceivedBy.trim()) {
      toast({ title: "Error", description: "Received by name is required.", variant: "destructive" });
      return;
    }
    // 🛑 VALIDATION: Check installment number only if payment is monthly
    if (editedPaymentType === 'monthly' && (editedInstallmentNumber === null || editedInstallmentNumber <= 0)) {
      toast({ title: "Error", description: "Please enter a valid installment number for monthly payment (e.g., 1, 2).", variant: "destructive" });
      return;
    }

    updatePaymentMutation.mutate({
      ...editingPayment,
      amount_paid: editedAmountPaid,
      payment_date: editedPaymentDate,
      received_by: editedReceivedBy.trim(),
      payment_type: editedPaymentType,
      installment_number: editedPaymentType === 'monthly' ? editedInstallmentNumber : null
    });
  };

  // Handle edit plan submission (omitted for brevity, no change needed)
  const handleEditPlanSubmit = () => {
    if (!planDetails) return;

    if (editedTotalPrice <= 0) {
      toast({ title: "Error", description: "Total Price must be greater than 0.", variant: "destructive" });
      return;
    }
    if (editedAdvanceAgreed < 0) {
      toast({ title: "Error", description: "Agreed Advance Amount cannot be negative.", variant: "destructive" });
      return;
    }
    if (editedMonthlyInstallment < 0) { // Monthly installment can be 0 if total price is paid by advance
      toast({ title: "Error", description: "Monthly Installment cannot be negative.", variant: "destructive" });
      return;
    }
    if (editedDurationMonths <= 0) {
      toast({ title: "Error", description: "Duration in Months must be greater than 0.", variant: "destructive" });
      return;
    }

    updateInstallmentPlanMutation.mutate({
      total_price: editedTotalPrice,
      advance_paid: editedAdvanceAgreed,
      monthly_installment: editedMonthlyInstallment,
      duration_months: editedDurationMonths,
    });
  };


  const openEditPaymentModal = (payment: InstallmentPayment) => {
    setEditingPayment(payment);
    setEditedAmountPaid(payment.amount_paid);
    setEditedPaymentDate(payment.payment_date);
    setEditedReceivedBy(payment.received_by);
    setEditedPaymentType(payment.payment_type);
    setEditedInstallmentNumber(payment.installment_number);
    setShowEditPaymentModal(true);
  };

  if (loadingPlanDetails || loadingPayments) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl h-[600px] flex items-center justify-center">
          <p>Loading plan details and payments...</p>
        </DialogContent>
      </Dialog>
    );
  }

  if (!planDetails) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl h-[600px] flex items-center justify-center">
          <p>Error: Could not load installment plan details.</p>
        </DialogContent>
      </Dialog>
    );
  }

  const handlePrintPlan = () => {
    if (!planDetails) return;

    const printContent = document.getElementById('printable-plan');
    const printWindow = window.open('', '_blank');

    if (printWindow && printContent) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Installment Plan - ${planDetails.customers?.name}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              @media print {
                .no-print { display: none; }
                body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
              }
            </style>
          </head>
          <body class="text-gray-900 p-10">
            <div class="text-center border-b-4 border-blue-900 pb-4 mb-6">
              <h1 class="text-4xl font-extrabold text-blue-900 uppercase">Al-Hamd Traders</h1>
              <p class="text-sm text-gray-600">Railway Road Chowk Shamah, Sargodha</p>
            </div>

            <div id="printable-wrapper">
              ${printContent.innerHTML}
            </div>

            <div class="text-center text-xs text-gray-500 border-t mt-10 pt-4">
              Thank you for your business! For any queries, contact: 0300-1234567
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }
  };

  const isPlanCompleted = remainingBalanceOnPlan <= 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl overflow-y-auto max-h-[90vh] p-6">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-gray-800">
            Installment Plan Details for {planDetails.customers?.name}
          </DialogTitle>
          <DialogDescription>
            Comprehensive view of the installment plan for {planDetails.rikshaws?.model_name} ({planDetails.rikshaws?.registration_number}).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Customer & Rickshaw Details */}
          <div id="printable-plan">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Customer Information</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p><strong>Name:</strong> {planDetails.customers?.name}</p>
                  <p><strong>CNIC:</strong> {planDetails.customers?.cnic}</p>
                  <p><strong>Phone:</strong> {planDetails.customers?.phone}</p>
                  <p><strong>Address:</strong> {planDetails.customers?.address}</p>
                </CardContent>
              </Card>
              <Card className="border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Rickshaw Information</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p><strong>Manufacturer:</strong> {planDetails.rikshaws?.manufacturer}</p>
                  <p><strong>Model:</strong> {planDetails.rikshaws?.model_name}</p>
                  <p><strong>Engine No:</strong> {planDetails.rikshaws?.engine_number}</p>
                  <p><strong>Chassis No:</strong> {planDetails.rikshaws?.chassis_number}</p>
                  <p><strong>Reg No:</strong> {planDetails.rikshaws?.registration_number}</p>
                  <p><strong>Type:</strong> {planDetails.rikshaws?.type}</p>
                </CardContent>
              </Card>
            </div>

            {/* Guarantor & Bank Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Guarantor Details</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p><strong>Name:</strong> {planDetails.customers?.guarantor_name}</p>
                  <p><strong>CNIC:</strong> {planDetails.customers?.guarantor_cnic}</p>
                  <p><strong>Phone:</strong> {planDetails.customers?.guarantor_phone}</p>
                  <p><strong>Address:</strong> {planDetails.customers?.guarantor_address}</p>
                </CardContent>
              </Card>
              <Card className="border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Bank Details</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p><strong>Bank Name:</strong> {planDetails.customers?.bank_name}</p>
                  <p><strong>Cheque Number:</strong> {planDetails.customers?.cheque_number}</p>
                </CardContent>
              </Card>
            </div>

            {/* Overall Payment Summary */}
            <Card className="border bg-blue-50">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-lg text-blue-700">Payment Summary</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditingPlan(!isEditingPlan)}
                  className="flex items-center gap-1"
                >
                  {isEditingPlan ? (
                    <>
                      <X className="h-4 w-4" /> Cancel Edit
                    </>
                  ) : (
                    <>
                      <Edit className="h-4 w-4" /> Edit Plan
                    </>
                  )}
                </Button>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Total Price:</Label>
                  {isEditingPlan ? (
                    <Input
                      type="number"
                      value={editedTotalPrice}
                      onChange={(e) => setEditedTotalPrice(parseFloat(e.target.value) || 0)}
                      className="font-bold text-lg"
                    />
                  ) : (
                    <p className="font-bold text-lg">Rs {planDetails.total_price?.toLocaleString()}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Agreed Advance Amount:</Label>
                  {isEditingPlan ? (
                    <Input
                      type="number"
                      value={editedAdvanceAgreed}
                      onChange={(e) => setEditedAdvanceAgreed(parseFloat(e.target.value) || 0)}
                      className="font-bold text-lg"
                    />
                  ) : (
                    <p className="font-bold text-lg">Rs {totalAgreedAdvance.toLocaleString()}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Collected Advance:</Label>
                  <p className="font-bold text-lg">Rs {collectedAdvance.toLocaleString()}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Monthly Installment:</Label>
                  {isEditingPlan ? (
                    <Input
                      type="number"
                      value={editedMonthlyInstallment}
                      onChange={(e) => setEditedMonthlyInstallment(parseFloat(e.target.value) || 0)}
                      className="font-bold text-lg"
                    />
                  ) : (
                    <p className="font-bold text-lg">Rs {planDetails.monthly_installment?.toLocaleString()}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Duration:</Label>
                  {isEditingPlan ? (
                    <Input
                      type="number"
                      value={editedDurationMonths}
                      onChange={(e) => setEditedDurationMonths(parseInt(e.target.value) || 0)}
                      className="font-bold text-lg"
                    />
                  ) : (
                    <p className="font-bold text-lg">{planDetails.duration_months} months</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Showroom Commission:</Label>
                  <p className="font-bold text-lg">Rs {planDetails.showroom_commission?.toLocaleString() || 0}</p>
                </div>
                {/* Re-added Remaining Advance Balance and Overall Remaining Balance */}
                <div className="space-y-2">
                  <p className="text-muted-foreground">Remaining Advance Balance:</p>
                  <p className="font-bold text-lg text-orange-700">Rs {remainingAgreedAdvanceDue.toLocaleString()}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-muted-foreground">Commission Status:</p>
                  <p className={cn("font-bold text-lg", planDetails.is_commission_paid ? "text-green-600" : "text-red-600")}>
                    {planDetails.is_commission_paid ? 'Paid' : 'Pending'} (Rs {totalCommissionPaid.toLocaleString()} paid)
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-muted-foreground">Overall Remaining Balance (Customer Debt + Outstanding Commission):</p>
                  <p className="font-bold text-2xl text-green-700">Rs {remainingBalanceOnPlan.toLocaleString()}</p>
                </div>
                {isEditingPlan && (
                  <div className="md:col-span-3 flex justify-end">
                    <Button
                      onClick={handleEditPlanSubmit}
                      disabled={updateInstallmentPlanMutation.isPending}
                    >
                      {updateInstallmentPlanMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" /> Save Plan Changes
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Advance Payment History (initial chunks) */}
            <Card className="border">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Initial Advance Payment History</CardTitle>
                <CardDescription>Records of the advance payments made at the time of plan creation.</CardDescription>
              </CardHeader>
              <CardContent>
                {planDetails.advance_payments && planDetails.advance_payments.length > 0 ? (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Amount (Rs)</TableHead>
                          <TableHead>Date Paid</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {planDetails.advance_payments.map((payment: AdvancePayment, index: number) => (
                          <TableRow key={index}>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell>Rs {payment.amount.toLocaleString()}</TableCell>
                            <TableCell>{new Date(payment.date).toLocaleDateString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No initial advance payments recorded.</p>
                )}
              </CardContent>
            </Card>

            {/* Monthly Installment Schedule */}
            <Card className="border">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Monthly Installment Schedule</CardTitle>
                <CardDescription>Includes all scheduled and upcoming monthly installments.</CardDescription>
              </CardHeader>
              <CardContent>
                {isPlanCompleted ? (
                  <div className="text-center py-8 text-green-600 font-semibold text-lg">
                    Plan Completed! All installments have been paid.
                  </div>
                ) : monthlySchedule.length > 0 ? (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Installment #</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Expected Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Amount Paid</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {monthlySchedule.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell>{item.installment_number}</TableCell>
                            <TableCell>{new Date(item.due_date).toLocaleDateString()}</TableCell>
                            <TableCell>Rs {item.expected_amount.toLocaleString()}</TableCell>
                            <TableCell>
                              <span className={cn(
                                "px-2 py-1 rounded-full text-xs font-medium",
                                item.status === 'Paid' && "bg-green-100 text-green-800",
                                item.status === 'Partially Paid' && "bg-yellow-100 text-yellow-800",
                                item.status === 'Unpaid' && "bg-gray-100 text-gray-800"
                              )}>
                                {item.status}
                              </span>
                            </TableCell>
                            <TableCell>Rs {item.paid_amount.toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No monthly installment schedule available.</p>
                )}
              </CardContent>
              {/* Final Payment / Early Settlement Amount (User Request) */}
              {remainingBalanceOnPlan > 0 && (
                <CardContent className="pt-0">
                  <div className="mt-4 p-4 border-2 border-dashed border-red-400 bg-red-50 rounded-md">
                    <div className="flex justify-between items-center">
                      <h4 className="text-lg font-bold text-red-700">Final Payment / Early Settlement Amount:</h4>
                      <p className="text-2xl font-extrabold text-red-900">
                        Rs {remainingBalanceOnPlan.toLocaleString()}
                      </p>
                    </div>
                    <p className="text-sm text-red-600 mt-1">This is the total amount required to immediately clear the customer's full debt (Remaining Customer Debt + Outstanding Showroom Commission).</p>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Actual Payment History */}
            <Card className="border">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Actual Payment History</CardTitle>
                <CardDescription>Includes all monthly, advance adjustment, commission, and discount payments.</CardDescription>
              </CardHeader>
              <CardContent>
                {installmentPayments.length > 0 ? (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date Paid</TableHead>
                          <TableHead>Amount Paid (Rs)</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Installment #</TableHead>
                          <TableHead>Received By</TableHead>
                          <TableHead className="text-right">Actions</TableHead> {/* New column for actions */}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {installmentPayments.map((payment: InstallmentPayment) => (
                          <TableRow key={payment.id}>
                            <TableCell>{new Date(payment.payment_date).toLocaleDateString()}</TableCell>
                            <TableCell>Rs {payment.amount_paid.toLocaleString()}</TableCell>
                            <TableCell>
                                {payment.payment_type === 'monthly' ? 'Monthly' : 
                                 payment.payment_type === 'commission' ? 'Commission' : 
                                 payment.payment_type === 'discount' ? 'Discount' : 'Advance Adjustment'} 
                            </TableCell>
                            <TableCell>
                              {payment.payment_type === 'monthly' && payment.installment_number !== null
                                ? payment.installment_number
                                : '-'}
                            </TableCell>
                            <TableCell>{payment.received_by}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditPaymentModal(payment)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No actual payments recorded for this plan yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
          {/* Record Payment Section */}
          <Card className="border bg-green-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-green-700 flex items-center justify-between">
                Record New Payment
                <Button variant="outline" size="sm" onClick={() => setShowRecordPaymentForm(!showRecordPaymentForm)}>
                  {showRecordPaymentForm ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                  {showRecordPaymentForm ? "Hide Form" : "Show Form"}
                </Button>
              </CardTitle>
            </CardHeader>
            {showRecordPaymentForm && (
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="payment-type">Payment Type *</Label>
                    <Select 
                      value={paymentType} 
                      onValueChange={(value: 'monthly' | 'advance_adjustment' | 'commission' | 'discount') => {
                        setPaymentType(value);
                        // Reset installment number if not monthly or discount
                        if (value !== 'monthly') {
                          setInstallmentNumber(null);
                        }
                      }}
                    >
                      <SelectTrigger id="payment-type">
                        <SelectValue placeholder="Select payment type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly Installment</SelectItem>
                        <SelectItem value="advance_adjustment">Advance Payment Adjustment</SelectItem>
                        <SelectItem value="discount">Discount / Early Payoff</SelectItem> {/* 🛑 Added Discount */}
                        <SelectItem value="commission">Showroom Commission Payment</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {paymentType === 'monthly' && (
                    <div className="space-y-2">
                      <Label htmlFor="installment-number">Installment # * (Manual Entry)</Label>
                      {/* 🛑 Changed from Select to Input */}
                      <Input
                          id="installment-number"
                          type="number"
                          placeholder="e.g., 1, 2, 3..."
                          value={installmentNumber || ''}
                          onChange={(e) => setInstallmentNumber(parseInt(e.target.value) || null)} 
                          required={paymentType === 'monthly'}
                          className="rounded-md border"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="amount-paid">Amount Paid (Rs) *</Label>
                    <Input
                      id="amount-paid"
                      type="number"
                      value={amountPaid || ''}
                      onChange={(e) => setAmountPaid(parseFloat(e.target.value) || 0)}
                      required
                      className="rounded-md border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payment-date">Payment Date *</Label>
                    <Input
                      id="payment-date"
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      required
                      className="rounded-md border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="received-by">Received By *</Label>
                    <Input
                      id="received-by"
                      type="text"
                      placeholder="Enter name of receiver (Use 'System' for discount)"
                      value={receivedBy}
                      onChange={(e) => setReceivedBy(e.target.value)}
                      required
                      className="rounded-md border"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <Button
                    onClick={handleRecordPayment}
                    disabled={isRecordingPayment}
                    className="px-6 bg-green-600 hover:bg-green-700"
                  >
                    {isRecordingPayment ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Recording...
                      </>
                    ) : "Record Payment"}
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
        <DialogFooter className="mt-6">
          <Button onClick={handlePrintPlan} className="ml-2">
            Print Plan
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Edit Payment Modal */}
      {editingPayment && (
        <Dialog open={showEditPaymentModal} onOpenChange={setShowEditPaymentModal}>
          <DialogContent className="max-w-md p-6">
            <DialogHeader>
              <DialogTitle>Edit Payment</DialogTitle>
              <DialogDescription>
                Modify the details for this payment record.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-payment-type">Payment Type *</Label>
                <Select
                  value={editedPaymentType}
                  onValueChange={(value: 'monthly' | 'advance_adjustment' | 'commission' | 'discount') => { // 🛑 Updated type
                    setEditedPaymentType(value);
                    if (value !== 'monthly') {
                      setEditedInstallmentNumber(null);
                    }
                  }}
                >
                  <SelectTrigger id="edit-payment-type">
                    <SelectValue placeholder="Select payment type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly Installment</SelectItem>
                    <SelectItem value="advance_adjustment">Advance Payment Adjustment</SelectItem>
                    <SelectItem value="discount">Discount / Early Payoff</SelectItem> {/* 🛑 Added Discount */}
                    <SelectItem value="commission">Showroom Commission Payment</SelectItem>
                  </SelectContent> {/* 🛑 FIXED: Closing tag was incorrect */}
                </Select>
              </div>
              {editedPaymentType === 'monthly' && (
                <div className="space-y-2">
                  <Label htmlFor="edit-installment-number">Installment # * (Manual Entry)</Label>
                  {/* 🛑 Changed from Select to Input */}
                  <Input
                    id="edit-installment-number"
                    type="number"
                    placeholder="e.g., 1, 2, 3..."
                    value={editedInstallmentNumber || ''}
                    onChange={(e) => setEditedInstallmentNumber(parseInt(e.target.value) || null)}
                    required={editedPaymentType === 'monthly'}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="edit-amount-paid">Amount Paid (Rs) *</Label>
                <Input
                  id="edit-amount-paid"
                  type="number"
                  value={editedAmountPaid || ''}
                  onChange={(e) => setEditedAmountPaid(parseFloat(e.target.value) || 0)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-payment-date">Payment Date *</Label>
                <Input
                  id="edit-payment-date"
                  type="date"
                  value={editedPaymentDate}
                  onChange={(e) => setEditedPaymentDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-received-by">Received By *</Label>
                <Input
                  id="edit-received-by"
                  type="text"
                  value={editedReceivedBy}
                  onChange={(e) => setEditedReceivedBy(e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditPaymentModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleEditPaymentSubmit} disabled={updatePaymentMutation.isPending}>
                {updatePaymentMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" /> Save Changes
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
};

export default InstallmentPage;