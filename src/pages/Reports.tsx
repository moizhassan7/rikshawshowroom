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
import { Calendar, Printer, DollarSign, Users, Car, Phone } from 'lucide-react';
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
    engine_number: string;
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
  rikshawDetails: string; // e.g., "New Asia - SAF-150 (REG: ABC-123)"
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

  // Fetch all installment plans
  const { data: installmentPlans = [], isLoading: loadingPlans, error: plansError } = useQuery<InstallmentPlan[]>({
    queryKey: ['report-installment-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('installment_plans')
        .select(`
          *,
          customers!inner (name, phone),
          rikshaws!inner (model_name, registration_number)
        `);
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

  // Generate the report data
  const reportData = useMemo(() => {
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
        if (isAfter(dueDate, startOfSelectedMonth) && isBefore(dueDate, endOfSelectedMonth) || format(dueDate, 'yyyy-MM-dd') === format(startOfSelectedMonth, 'yyyy-MM-dd') || format(dueDate, 'yyyy-MM-dd') === format(endOfSelectedMonth, 'yyyy-MM-dd')) {
          if (paidAmountForInstallment < expectedAmountForInstallment) {
            const amountRemaining = expectedAmountForInstallment - paidAmountForInstallment;
            data.push({
              planId: plan.id,
              customerName: plan.customers?.name || 'N/A',
              rikshawDetails: `${plan.rikshaws?.model_name} (REG: ${plan.rikshaws?.registration_number || 'N/A'})`,
              phoneNumber: plan.customers?.phone || 'N/A',
              amountDue: amountRemaining,
              dueDate: format(dueDate, 'yyyy-MM-dd'),
              type: 'Monthly',
              installmentNumber: i,
              status: isBefore(dueDate, today) ? 'Overdue' : 'Due',
            });
          }
        }
      }

      // --- 2. Advance Due ---
      // Calculate total agreed advance (sum of all advance_payments in the plan's array)
      const totalAgreedAdvanceOnPlan = plan.advance_payments.reduce((sum, p) => sum + p.amount, 0);

      // Calculate total collected advance adjustments (payments of type 'advance_adjustment')
      const totalCollectedAdvanceAdjustments = paymentsForPlan.reduce((sum, p) => p.payment_type === 'advance_adjustment' ? sum + p.amount_paid : sum, 0);

      // The initial advance collected at sale time (first entry in advance_payments array)
      const initialAdvanceAtSale = plan.advance_payments[0]?.amount || 0;

      // Total advance collected so far (initial + adjustments)
      const totalAdvanceCollectedOverall = initialAdvanceAtSale + totalCollectedAdvanceAdjustments;

      const remainingAdvanceAmountDue = totalAgreedAdvanceOnPlan - totalAdvanceCollectedOverall;

      if (remainingAdvanceAmountDue > 0) {
        // Find the specific advance payment entry that is due in this month or was due earlier
        // For simplicity, we'll just list the total remaining advance if the plan's agreement date
        // is within or before the selected report month.
        const earliestAdvanceDueDate = plan.advance_payments[0]?.date ? parseISO(plan.advance_payments[0].date) : planAgreementDate;

        // If the earliest due date for any advance payment (or agreement date) is in or before the report month
        if (isBefore(earliestAdvanceDueDate, endOfSelectedMonth) || format(earliestAdvanceDueDate, 'yyyy-MM-dd') === format(endOfSelectedMonth, 'yyyy-MM-dd')) {
          data.push({
            planId: plan.id,
            customerName: plan.customers?.name || 'N/A',
            rikshawDetails: `${plan.rikshaws?.model_name} (REG: ${plan.rikshaws?.registration_number || 'N/A'})`,
            phoneNumber: plan.customers?.phone || 'N/A',
            amountDue: remainingAdvanceAmountDue,
            dueDate: format(earliestAdvanceDueDate, 'yyyy-MM-dd'), // Use the agreement date or first advance date
            type: 'Advance Due',
            installmentNumber: null,
            status: isBefore(earliestAdvanceDueDate, today) ? 'Overdue' : 'Due',
          });
        }
      }
    });

    // Sort report data by due date
    data.sort((a, b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime());

    return data;
  }, [installmentPlans, allInstallmentPayments, reportMonth, reportYear, loadingPlans, loadingAllPayments]);


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
          </div>

          <div id="report-printable-area">
            <h3 className="text-xl font-semibold mb-4">
              Report for {format(new Date(parseInt(reportYear), parseInt(reportMonth), 1), 'MMMM yyyy')}
            </h3>
            {(loadingPlans || loadingAllPayments) ? (
              <div className="text-center py-8 text-muted-foreground">Loading report data...</div>
            ) : reportData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No upcoming payments for this month.</div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer Name</TableHead>
                      <TableHead>Rickshaw Details</TableHead>
                      <TableHead>Phone Number</TableHead>
                      <TableHead>Amount Due</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Installment #</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.map((entry, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{entry.customerName}</TableCell>
                        <TableCell>{entry.rikshawDetails}</TableCell>
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
