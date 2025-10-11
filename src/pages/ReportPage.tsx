import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Printer, Search } from 'lucide-react';
import { format, addMonths, isBefore, isAfter, parseISO, startOfMonth, endOfMonth, getYear, getMonth } from 'date-fns';
import { cn } from '@/lib/utils';

// --- Interface Definitions (Kept from your original code) ---
interface Customer {
  id: string;
  name: string;
  phone: string;
}

interface Rikshaw {
    model_name: string;
    registration_number: string;
    engine_number: string;
}
  
interface AdvancePayment {
    amount: number;
    date: string;
}
  
interface InstallmentPlan {
    id: string;
    total_price: number;
    advance_payments: AdvancePayment[];
    monthly_installment: number;
    duration_months: number;
    customers: Customer;
    rikshaws: Rikshaw;
    agreement_date: string;
}
  
interface InstallmentPayment {
    id: string;
    installment_plan_id: string;
    amount_paid: number;
    payment_type: 'monthly' | 'advance_adjustment';
    installment_number?: number | null;
}
  
interface ReportEntry {
    planId: string;
    customerName: string;
    rikshawDetails: string;
    phoneNumber: string;
    amountDue: number;
    dueDate: string;
    type: 'Monthly' | 'Advance Due' | string;
    installmentNumber?: number | null | string;
    status: 'Due' | 'Overdue';
}
// -----------------------------

// Helper function to split combined ReportEntry into separate, renderable due items
const splitMergedEntry = (entry: ReportEntry) => {
    const types = entry.type.split(' & ').map(t => t.trim());
    
    // This helper logic is kept exactly as it was in the previous response
    if (types.length === 1 && entry.type === 'Monthly' && typeof entry.installmentNumber === 'string' && entry.installmentNumber.includes(',')) {
        const installments = entry.installmentNumber.toString().split(', ').map(s => s.replace('#', '').trim());
        const items = [{
            type: entry.type,
            installment: entry.installmentNumber,
            date: entry.dueDate,
            amount: entry.amountDue,
            status: entry.status,
            sortKey: entry.dueDate,
        }];
        
        for (let i = 1; i < installments.length; i++) {
             items.push({
                type: entry.type,
                installment: installments[i],
                date: entry.dueDate, 
                amount: 0, 
                status: entry.status,
                sortKey: entry.dueDate,
             });
        }
        return items;

    } else if (types.length > 1) {
        const allDues = [];
        const hasAdvance = types.includes('Advance Due');
        const hasMonthly = types.includes('Monthly');

        if (hasAdvance) {
            allDues.push({
                type: 'Advance Due',
                installment: 'Advance',
                date: entry.dueDate,
                amount: hasMonthly ? entry.amountDue * 0.4 : entry.amountDue,
                status: entry.status,
                sortKey: entry.dueDate,
            });
        }
        
        if (hasMonthly) {
             allDues.push({
                type: 'Monthly',
                installment: entry.installmentNumber,
                date: entry.dueDate,
                amount: hasAdvance ? entry.amountDue * 0.6 : entry.amountDue,
                status: entry.status,
                sortKey: entry.dueDate,
            });
        }
        
        return allDues.sort((a, b) => parseISO(a.sortKey).getTime() - parseISO(b.sortKey).getTime());
    }

    return [{
        type: entry.type,
        installment: entry.installmentNumber || '-',
        date: entry.dueDate,
        amount: entry.amountDue,
        status: entry.status,
        sortKey: entry.dueDate,
    }];
};
// -----------------------------

const ReportPage = () => {
  const { toast } = useToast();
  const today = new Date();

  const [reportMonth, setReportMonth] = useState(getMonth(today).toString());
  const [reportYear, setReportYear] = useState(getYear(today).toString());
  const [searchTerm, setSearchTerm] = useState('');

  // --- Data Fetching Queries (UNMODIFIED) ---
  const { data: installmentPlans = [], isLoading: loadingPlans, error: plansError } = useQuery<InstallmentPlan[]>({
    queryKey: ['report-installment-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('installment_plans')
        .select(`
          *,
          customers!inner (name, phone),
          rikshaws!inner (model_name, registration_number, engine_number)
        `); 
      if (error) throw error;
      return data as any[];
    }
  });

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

  useEffect(() => { if (plansError) { toast({ title: "Error fetching installment plans", description: plansError.message, variant: "destructive" }); } }, [plansError, toast]);
  useEffect(() => { if (allPaymentsError) { toast({ title: "Error fetching payments", description: allPaymentsError.message, variant: "destructive" }); } }, [allPaymentsError, toast]);

  // --- Core Report Logic (YOUR ORIGINAL LOGIC - UNMODIFIED) ---
  const rawReportData: ReportEntry[] = useMemo(() => {
    if (loadingPlans || loadingAllPayments) return [];

    const selectedDate = new Date(parseInt(reportYear), parseInt(reportMonth), 1);
    const startOfSelectedMonth = startOfMonth(selectedDate);
    const endOfSelectedMonth = endOfMonth(selectedDate);

    const individualDues: ReportEntry[] = [];

    installmentPlans.forEach(plan => {
      const paymentsForPlan = allInstallmentPayments.filter(p => p.installment_plan_id === plan.id);
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
        const paidAmount = monthlyPaymentsMade[i] || 0;
        const expectedAmount = plan.monthly_installment;
        const isDueInMonth = (isAfter(dueDate, startOfSelectedMonth) && isBefore(dueDate, endOfSelectedMonth)) || format(dueDate, 'yyyy-MM-dd') === format(startOfSelectedMonth, 'yyyy-MM-dd') || format(dueDate, 'yyyy-MM-dd') === format(endOfSelectedMonth, 'yyyy-MM-dd');
        const isOverdue = isBefore(dueDate, startOfSelectedMonth) && paidAmount < expectedAmount;

        if ((isDueInMonth || isOverdue) && paidAmount < expectedAmount) {
          individualDues.push({
            planId: plan.id, customerName: plan.customers?.name || 'N/A', rikshawDetails: `REG: ${plan.rikshaws?.registration_number || 'N/A'} (ENG: ${plan.rikshaws?.engine_number || 'N/A'})`, phoneNumber: plan.customers?.phone || 'N/A',
            amountDue: expectedAmount - paidAmount, dueDate: format(dueDate, 'yyyy-MM-dd'), type: 'Monthly', installmentNumber: i, status: isBefore(dueDate, today) ? 'Overdue' : 'Due',
          });
        }
      }

      let totalMonthlyOverpayment = 0;
      Object.keys(monthlyPaymentsMade).forEach(numStr => {
        const paid = monthlyPaymentsMade[parseInt(numStr)];
        if (paid > plan.monthly_installment) totalMonthlyOverpayment += paid - plan.monthly_installment;
      });
      
      const totalAgreedAdvance = plan.advance_payments.reduce((sum, p) => sum + p.amount, 0);
      const advanceAdjustmentsPaid = paymentsForPlan.reduce((sum, p) => p.payment_type === 'advance_adjustment' ? sum + p.amount_paid : sum, 0);
      const initialAdvance = plan.advance_payments[0]?.amount || 0;
      const totalAdvanceCollected = initialAdvance + advanceAdjustmentsPaid;
      const remainingAdvance = (totalAgreedAdvance - totalAdvanceCollected) - totalMonthlyOverpayment;

      if (remainingAdvance > 0) {
        const advanceDueDate = plan.advance_payments[0]?.date ? parseISO(plan.advance_payments[0].date) : planAgreementDate;
        const isDueInMonth = (isAfter(advanceDueDate, startOfSelectedMonth) && isBefore(advanceDueDate, endOfSelectedMonth)) || format(advanceDueDate, 'yyyy-MM-dd') === format(startOfSelectedMonth, 'yyyy-MM-dd') || format(advanceDueDate, 'yyyy-MM-dd') === format(endOfSelectedMonth, 'yyyy-MM-dd');
        const isOverdue = isBefore(advanceDueDate, startOfSelectedMonth);

        if (isDueInMonth || isOverdue) {
          individualDues.push({
            planId: plan.id, customerName: plan.customers?.name || 'N/A', rikshawDetails: `REG: ${plan.rikshaws?.registration_number || 'N/A'} (ENG: ${plan.rikshaws?.engine_number || 'N/A'})`, phoneNumber: plan.customers?.phone || 'N/A',
            amountDue: remainingAdvance, dueDate: format(advanceDueDate, 'yyyy-MM-dd'), type: 'Advance Due', installmentNumber: null, status: isBefore(advanceDueDate, today) ? 'Overdue' : 'Due',
          });
        }
      }
    });
    
    const mergedDues: Record<string, ReportEntry> = {};

    individualDues.forEach(due => {
      if (!mergedDues[due.planId]) {
        mergedDues[due.planId] = { ...due, type: '', installmentNumber: '' };
      } else {
        mergedDues[due.planId].amountDue += due.amountDue;
      }

      const existing = mergedDues[due.planId];
      const types = new Set(existing.type ? existing.type.split(' & ') : []);
      types.add(due.type);
      existing.type = Array.from(types).join(' & ');

      if (due.type === 'Monthly' && due.installmentNumber) {
        const installments = existing.installmentNumber ? existing.installmentNumber.toString().split(', ') : [];
        installments.push(`#${due.installmentNumber}`);
        existing.installmentNumber = Array.from(new Set(installments)).join(', ');
      }
      
      if (isBefore(parseISO(due.dueDate), parseISO(existing.dueDate))) {
        existing.dueDate = due.dueDate;
      }

      if (due.status === 'Overdue') {
        existing.status = 'Overdue';
      }
    });

    const finalReport = Object.values(mergedDues);
    finalReport.sort((a, b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime());
    return finalReport;

  }, [installmentPlans, allInstallmentPayments, reportMonth, reportYear, loadingPlans, loadingAllPayments, today]);
  // -----------------------------------------------------------

  const filteredReportData = useMemo(() => {
    if (!searchTerm) return rawReportData;
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return rawReportData.filter(entry =>
      entry.customerName.toLowerCase().includes(lowerCaseSearchTerm) ||
      entry.rikshawDetails.toLowerCase().includes(lowerCaseSearchTerm) ||
      entry.phoneNumber.includes(lowerCaseSearchTerm)
    );
  }, [rawReportData, searchTerm]);

  // --- NEW PRINT FUNCTIONALITY ---
  const handlePrintReport = () => {
    const printContent = document.getElementById('report-printable-area');
    if (printContent) {
      // Create a new window for printing
      const printWindow = window.open('', '', 'height=600,width=800');
      
      if (printWindow) {
        // Copy relevant styles for a clean print
        const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'));
        const styleHtml = styles.map(s => s.outerHTML).join('');

        // Construct the content to print
        const contentHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Monthly Installment Report</title>
            ${styleHtml}
            <style>
              @media print {
                body { margin: 0; padding: 10mm; }
                .report-header { text-align: center; margin-bottom: 20px; }
                .report-header h1 { font-size: 24px; font-weight: bold; }
                .report-header p { font-size: 14px; color: #666; }
                /* Ensure all table rows/cells are visible and borders are clean */
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
                .text-xs { font-size: 10px; }
                .font-bold { font-weight: bold; }
                .text-red-600 { color: #dc2626; }
                .bg-red-100 { background-color: #fee2e2; }
                .text-red-800 { color: #991b1b; }
                .bg-blue-100 { background-color: #dbeafe; }
                .text-blue-800 { color: #1e40af; }
                /* Hide things that shouldn't print (like the search bar if it were inside) */
                .no-print { display: none; } 
                /* Force row spans to work cleanly */
                .align-top { vertical-align: top; }
              }
            </style>
          </head>
          <body>
            <div class="report-header">
                <h1>Monthly Installment Report</h1>
                <p>Report for ${format(new Date(parseInt(reportYear), parseInt(reportMonth), 1), 'MMMM yyyy')}</p>
            </div>
            ${printContent.innerHTML}
          </body>
          </html>
        `;

        printWindow.document.write(contentHtml);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        // Do not close the window immediately, let the user handle the print dialog
      } else {
          toast({ title: "Print Error", description: "Could not open print window. Please check pop-up blocker.", variant: "destructive" });
      }
    } else {
        toast({ title: "Print Error", description: "Print area not found. Cannot generate report.", variant: "destructive" });
    }
  };
  // ------------------------------------

  const currentYear = getYear(today);
  const years = Array.from({ length: 5 }, (_, i) => (currentYear - 2 + i).toString());
  const months = Array.from({ length: 12 }, (_, i) => i.toString());

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800">Monthly Installment Report</h1>
        <p className="text-muted-foreground mt-2">
          Quickly view and manage all upcoming installment and advance payments, consolidated by customer, for any selected month.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-bold">
            <Calendar className="h-5 w-5 text-blue-600" />
            Report Period & Actions
          </CardTitle>
          <CardDescription>Select the month and year to generate the report and print it for your records.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-center">
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
            <Button onClick={handlePrintReport} className="w-full sm:w-auto flex items-center gap-2 bg-blue-600 hover:bg-blue-700">
              <Printer className="h-4 w-4" /> Print Report
            </Button>
          </div>
        </CardContent>
      </Card>
      
      <div className="pt-4">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 flex items-center gap-2">
          $ Pending Payments Overview
        </h2>
        <p className="text-muted-foreground mb-4">
            Details of all outstanding monthly installments and advance payments for the selected period.
        </p>
        
        {/* --- START PRINTABLE AREA WRAPPER --- */}
        <div id="report-printable-area"> 
            
            <h3 className="text-lg font-semibold mb-4">
                Report for {format(new Date(parseInt(reportYear), parseInt(reportMonth), 1), 'MMMM yyyy')}
            </h3>

            {/* The search bar is now outside the printable area or should be explicitly styled as `no-print` if needed */}
            <div className="relative mb-4 no-print">
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
                <div className="overflow-x-auto rounded-md border shadow-sm">
                <Table>
                    <TableHeader>
                    <TableRow className="bg-gray-100">
                        <TableHead className="w-[18%]">Customer Name</TableHead>
                        <TableHead className="w-[18%]">Rickshaw Details</TableHead>
                        <TableHead className="w-[12%]">Phone Number</TableHead>
                        <TableHead className="w-[12%]">Total Due</TableHead>
                        <TableHead className="w-[30%] text-left">Due Items (Type | Due Date | Inst. # | Amount)</TableHead>
                        <TableHead className="w-[10%] text-center">Overall Status</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {filteredReportData.map((entry) => {
                        const visualDues = splitMergedEntry(entry);
                        const rowCount = visualDues.length > 0 ? visualDues.length : 1;

                        return (
                            <React.Fragment key={entry.planId}>
                                {visualDues.map((dueItem, index) => (
                                    <TableRow key={`${entry.planId}-${dueItem.type}-${index}`} className={cn(
                                        "bg-white", 
                                        index === 0 ? 'border-t-2 border-blue-100' : 'border-t-0' 
                                    )}>
                                        {index === 0 && (
                                            <>
                                                <TableCell className="font-semibold align-top" rowSpan={rowCount}>
                                                    {entry.customerName.toUpperCase()}
                                                </TableCell>
                                                <TableCell className="text-xs align-top" rowSpan={rowCount}>
                                                    {entry.rikshawDetails}
                                                </TableCell>
                                                <TableCell className="text-xs align-top" rowSpan={rowCount}>
                                                    {entry.phoneNumber}
                                                </TableCell>
                                                <TableCell className="font-bold align-top text-red-600" rowSpan={rowCount}>
                                                    Rs {entry.amountDue.toLocaleString()}
                                                </TableCell>
                                            </>
                                        )}
                                        
                                        <TableCell className="py-2 text-sm">
                                            <div className="flex justify-between items-center pr-2 font-medium">
                                                <span className={dueItem.type.includes('Advance') ? 'text-orange-700' : 'text-gray-700'}>
                                                    {dueItem.type}
                                                </span>
                                                <span className={cn(dueItem.status === 'Overdue' ? 'text-red-700' : 'text-gray-700')}>
                                                    {dueItem.amount > 0 ? `Rs ${dueItem.amount.toLocaleString()}` : '-'}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-xs text-muted-foreground pr-2 mt-0.5">
                                                <span>{new Date(dueItem.date).toLocaleDateString()} (Inst. {dueItem.installment ? dueItem.installment : '-'})</span>
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded-full text-xs font-medium",
                                                    dueItem.status === 'Overdue' ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800",
                                                )}>{dueItem.status}</span>
                                            </div>
                                        </TableCell>

                                        {index === 0 && (
                                            <TableCell rowSpan={rowCount} className="align-middle"> 
                                                <div className="flex justify-center items-center">
                                                    <span className={cn(
                                                        "px-2 py-1 rounded-full text-xs font-medium uppercase",
                                                        entry.status === 'Overdue' && "bg-red-100 text-red-800",
                                                        entry.status === 'Due' && "bg-blue-100 text-blue-800",
                                                    )}>
                                                        {entry.status}
                                                    </span>
                                                </div>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))}
                            </React.Fragment>
                        );
                    })}
                    </TableBody>
                </Table>
                </div>
            )}
        </div>
        {/* --- END PRINTABLE AREA WRAPPER --- */}
      </div>
    </div>
  );
};

export default ReportPage;