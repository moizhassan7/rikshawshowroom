import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Printer, DollarSign, Search } from 'lucide-react'; // Removed FileText
import { format, addMonths, isBefore, isAfter, parseISO, startOfMonth, endOfMonth, getYear, getMonth } from 'date-fns';
import { cn } from '@/lib/utils';

// Interface definitions for data structures (re-used from other components)
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
  availability: string; // 'sold', 'unsold'
  purchase_date: string;
  purchase_price: number;
  sale_price: number | null;
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
    engine_number: string; // Added engine_number to rikshaw_details
    chassis_number: string;
    registration_number: string;
    type: string;
  };
  customers: Customer; // Nested customer details
  rikshaws: Rikshaw; // Nested rikshaw details
  created_at: string; // Sale date
  agreement_date: string; // Agreement date for installment calculation
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

// Report specific interface for table entries
interface ReportEntry {
  planId: string;
  customerName: string;
  rikshawDetails: string; // e.g., "REG: ABC-123 | ENG: 123456"
  phoneNumber: string;
  amountDue: number;
  dueDate: string; // YYYY-MM-DD
  type: 'Monthly' | 'Advance Due';
  installmentNumber?: number | null; // For monthly type
  status: 'Due' | 'Overdue';
}

const ReportPage = () => {
  const { toast } = useToast();
  const today = new Date();

  // State for selected month and year for the report
  const [reportMonth, setReportMonth] = useState(getMonth(today).toString());
  const [reportYear, setReportYear] = useState(getYear(today).toString());
  // State for search term within the report table
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch all installment plans
  const { data: installmentPlans = [], isLoading: loadingPlans, error: plansError } = useQuery<InstallmentPlan[]>({
    queryKey: ['report-installment-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('installment_plans')
        .select(`
          *,
          customers!inner (name, phone),
          rikshaws!inner (model_name, registration_number, engine_number)
        `); // Added engine_number here
      if (error) throw error;
      return data as InstallmentPlan[];
    }
  });

  // Fetch all payments
  const { data: allInstallmentPayments = [], isLoading: loadingAllPayments, error: allPaymentsError } = useQuery<InstallmentPayment[]>({
    queryKey: ['report-all-installment-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('installment_payments')
        .select('*');
      if (error) throw error;
      return data as InstallmentPayment[];
    }
  });

  // Handle errors for fetching data
  useEffect(() => {
    if (plansError) {
      toast({
        title: "Error fetching installment plans for report",
        description: plansError.message,
        variant: "destructive",
      });
    }
  }, [plansError, toast]);

  useEffect(() => {
    if (allPaymentsError) {
      toast({
        title: "Error fetching payments for report",
        description: allPaymentsError.message,
        variant: "destructive",
      });
    }
  }, [allPaymentsError, toast]);

  // Generate the raw report data based on selected month/year
  const rawReportData = useMemo(() => {
    if (loadingPlans || loadingAllPayments) return [];

    const selectedDate = new Date(parseInt(reportYear), parseInt(reportMonth), 1);
    const startOfSelectedMonth = startOfMonth(selectedDate);
    const endOfSelectedMonth = endOfMonth(selectedDate);

    const data: ReportEntry[] = [];

    installmentPlans.forEach(plan => {
      const paymentsForPlan = allInstallmentPayments.filter(p => p.installment_plan_id === plan.id);

      // --- 1. Monthly Installments ---
      const planAgreementDate = parseISO(plan.agreement_date);
      const monthlyPaymentsMade: Record<number, number> = {};
      paymentsForPlan
        .filter(p => p.payment_type === 'monthly' && p.installment_number !== null)
        .forEach(p => {
          if (p.installment_number) {
            monthlyPaymentsMade[p.installment_number] = (monthlyPaymentsMade[p.installment_number] || 0) + p.amount_paid;
          }
        });

      for (let i = 1; i <= plan.duration_months; i++) {
        const dueDate = addMonths(planAgreementDate, i);
        const paidAmountForInstallment = monthlyPaymentsMade[i] || 0;
        const expectedAmountForInstallment = plan.monthly_installment;

        // Check if this installment is due within the selected report month
        // or if it was due before and is still unpaid/partially paid
        const isDueInSelectedMonth = (isAfter(dueDate, startOfSelectedMonth) && isBefore(dueDate, endOfSelectedMonth)) ||
                                     format(dueDate, 'yyyy-MM-dd') === format(startOfSelectedMonth, 'yyyy-MM-dd') ||
                                     format(dueDate, 'yyyy-MM-dd') === format(endOfSelectedMonth, 'yyyy-MM-dd');
        
        const isOverdueBeforeMonth = isBefore(dueDate, startOfSelectedMonth) && paidAmountForInstallment < expectedAmountForInstallment;

        if ((isDueInSelectedMonth || isOverdueBeforeMonth) && paidAmountForInstallment < expectedAmountForInstallment) {
          const amountRemaining = expectedAmountForInstallment - paidAmountForInstallment;
          data.push({
            planId: plan.id,
            customerName: plan.customers?.name || 'N/A',
            rikshawDetails: `REG: ${plan.rikshaws?.registration_number || 'N/A'} | ENG: ${plan.rikshaws?.engine_number || 'N/A'}`, // Updated format
            phoneNumber: plan.customers?.phone || 'N/A',
            amountDue: amountRemaining,
            dueDate: format(dueDate, 'yyyy-MM-dd'),
            type: 'Monthly',
            installmentNumber: i,
            status: isBefore(dueDate, today) && amountRemaining > 0 ? 'Overdue' : 'Due',
          });
        }
      }

      // --- 2. Advance Due ---
      const totalAgreedAdvanceOnPlan = plan.advance_payments.reduce((sum, p) => sum + p.amount, 0);
      const totalCollectedAdvanceAdjustments = paymentsForPlan.reduce((sum, p) => p.payment_type === 'advance_adjustment' ? sum + p.amount_paid : sum, 0);
      const initialAdvanceAtSale = plan.advance_payments[0]?.amount || 0;
      const totalAdvanceCollectedOverall = initialAdvanceAtSale + totalCollectedAdvanceAdjustments;
      const remainingAdvanceAmountDue = totalAgreedAdvanceOnPlan - totalAdvanceCollectedOverall;

      if (remainingAdvanceAmountDue > 0) {
        // For advance due, we consider it due if the agreement date (or first advance date)
        // is within or before the selected report month and it's still pending.
        const effectiveAdvanceDueDate = plan.advance_payments[0]?.date ? parseISO(plan.advance_payments[0].date) : planAgreementDate;

        const isAdvanceDueInSelectedMonth = (isAfter(effectiveAdvanceDueDate, startOfSelectedMonth) && isBefore(effectiveAdvanceDueDate, endOfSelectedMonth)) ||
                                            format(effectiveAdvanceDueDate, 'yyyy-MM-dd') === format(startOfSelectedMonth, 'yyyy-MM-dd') ||
                                            format(effectiveAdvanceDueDate, 'yyyy-MM-dd') === format(endOfSelectedMonth, 'yyyy-MM-dd');
        
        const isAdvanceOverdueBeforeMonth = isBefore(effectiveAdvanceDueDate, startOfSelectedMonth);

        if (isAdvanceDueInSelectedMonth || isAdvanceOverdueBeforeMonth) {
          data.push({
            planId: plan.id,
            customerName: plan.customers?.name || 'N/A',
            rikshawDetails: `REG: ${plan.rikshaws?.registration_number || 'N/A'} | ENG: ${plan.rikshaws?.engine_number || 'N/A'}`, // Updated format
            phoneNumber: plan.customers?.phone || 'N/A',
            amountDue: remainingAdvanceAmountDue,
            dueDate: format(effectiveAdvanceDueDate, 'yyyy-MM-dd'), // Use the agreement date or first advance date
            type: 'Advance Due',
            installmentNumber: null,
            status: isBefore(effectiveAdvanceDueDate, today) ? 'Overdue' : 'Due',
          });
        }
      }
    });

    // Sort raw data by due date
    data.sort((a, b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime());

    return data;
  }, [installmentPlans, allInstallmentPayments, reportMonth, reportYear, loadingPlans, loadingAllPayments]);

  // Filtered report data based on search term
  const filteredReportData = useMemo(() => {
    if (!searchTerm) return rawReportData;
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return rawReportData.filter(entry =>
      entry.customerName.toLowerCase().includes(lowerCaseSearchTerm) ||
      entry.rikshawDetails.toLowerCase().includes(lowerCaseSearchTerm) ||
      entry.phoneNumber.includes(lowerCaseSearchTerm)
    );
  }, [rawReportData, searchTerm]);

  // Summary statistics for the filtered report data (removed from display, but kept for reference if needed later)
  const summaryStatistics = useMemo(() => {
    let totalExpectedAmount = 0;
    let totalOverdueAmount = 0;

    filteredReportData.forEach(entry => {
      totalExpectedAmount += entry.amountDue;
      if (entry.status === 'Overdue') {
        totalOverdueAmount += entry.amountDue;
      }
    });

    return {
      totalExpectedAmount,
      totalOverdueAmount,
    };
  }, [filteredReportData]);


  const handlePrintReport = () => {
    const printContent = document.getElementById('report-printable-area');
    const printWindow = window.open('', '_blank');

    if (printWindow && printContent) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Installment Report - ${format(new Date(parseInt(reportYear), parseInt(reportMonth), 1), 'MMMM yyyy')}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              @media print {
                .no-print { display: none; }
                body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
                th { background-color: #f1f5f9; }
                .status-badge { padding: 4px 8px; border-radius: 9999px; font-weight: 500; font-size: 0.75rem; }
                .bg-red-100 { background-color: #fee2e2; } .text-red-800 { color: #991b1b; }
                .bg-blue-100 { background-color: #dbeafe; } .text-blue-800 { color: #1e40af; }
                .summary-card { background-color: #f0f9ff; border: 1px solid #bfdbfe; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem; }
                .summary-item { margin-bottom: 0.5rem; }
                .summary-label { font-weight: 600; color: #374151; }
                .summary-value { font-weight: 700; font-size: 1.125rem; }
              }
            </style>
          </head>
          <body class="text-gray-900 p-10">
            <div class="text-center border-b-4 border-blue-900 pb-4 mb-6">
              <h1 class="text-4xl font-extrabold text-blue-900 uppercase">AL-HAMD TRADERS</h1>
              <p class="text-sm text-gray-600">Railway Road Chowk Shamah, Sargodha</p>
            </div>

            <h2 class="text-2xl font-bold text-gray-800 mb-4">
              Installment Report for ${format(new Date(parseInt(reportYear), parseInt(reportMonth), 1), 'MMMM yyyy')}
            </h2>

            <div id="report-content-to-print">
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

  const years = Array.from({ length: 5 }, (_, i) => (getYear(today) - 2 + i).toString()); // Current year +/- 2
  const months = Array.from({ length: 12 }, (_, i) => i.toString()); // 0-11 for months

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800">Monthly Installment Report</h1>
        <p className="text-muted-foreground mt-2">
          View and print upcoming installment and advance payments for any given month.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Select Report Period
          </CardTitle>
          <CardDescription>Choose the month and year to generate the report.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-center mb-6">
            <div className="flex-1 w-full sm:w-auto">
              <Label htmlFor="report-month" className="sr-only">Month</Label>
              <Select value={reportMonth} onValueChange={setReportMonth}>
                <SelectTrigger id="report-month" className="w-full">
                  <SelectValue placeholder="Select Month" />
                </SelectTrigger>
                <SelectContent>
                  {months.map(m => (
                    <SelectItem key={m} value={m}>
                      {format(new Date(parseInt(reportYear), parseInt(m), 1), 'MMMM')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 w-full sm:w-auto">
              <Label htmlFor="report-year" className="sr-only">Year</Label>
              <Select value={reportYear} onValueChange={setReportYear}>
                <SelectTrigger id="report-year" className="w-full">
                  <SelectValue placeholder="Select Year" />
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handlePrintReport} className="w-full sm:w-auto flex items-center gap-2">
              <Printer className="h-4 w-4" /> Print Report
            </Button>
            {/* Removed Export CSV Button */}
          </div>

          <div id="report-printable-area">
            <h3 className="text-xl font-semibold mb-4">
              Report for {format(new Date(parseInt(reportYear), parseInt(reportMonth), 1), 'MMMM yyyy')}
            </h3>

            {/* Removed Summary Statistics Card */}

            {/* Search bar for report data */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by customer name, rickshaw details, or phone number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 rounded-md border"
              />
            </div>

            {(loadingPlans || loadingAllPayments) ? (
              <div className="text-center py-8 text-muted-foreground">Loading report data...</div>
            ) : filteredReportData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No upcoming payments found for this month.</div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer Name</TableHead>
                      <TableHead>Rickshaw Details</TableHead> {/* This heading remains general */}
                      <TableHead>Phone Number</TableHead>
                      <TableHead>Amount Due</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Installment #</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReportData.map((entry, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{entry.customerName}</TableCell>
                        <TableCell>{entry.rikshawDetails}</TableCell> {/* This will now show REG | ENG */}
                        <TableCell>{entry.phoneNumber}</TableCell>
                        <TableCell>Rs {entry.amountDue.toLocaleString()}</TableCell>
                        <TableCell>{new Date(entry.dueDate).toLocaleDateString()}</TableCell>
                        <TableCell>{entry.type}</TableCell>
                        <TableCell>{entry.installmentNumber || '-'}</TableCell>
                        <TableCell>
                          <span className={cn(
                            "px-2 py-1 rounded-full text-xs font-medium",
                            entry.status === 'Overdue' && "bg-red-100 text-red-800",
                            entry.status === 'Due' && "bg-blue-100 text-blue-800",
                          )}>
                            {entry.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportPage;
