// src/pages/SellRickshaw.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { User, Car, Calendar, DollarSign, Plus, Check, Printer, Download } from 'lucide-react';
import { format, addMonths } from 'date-fns';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
interface Customer {
  id: string;
  name: string;
  cnic: string;
  phone: string;
  address: string;
}

interface Rikshaw {
  id: string;
  model: string;
  engine_number: string;
  price: number;
  status: string;
}

const SellRickshaw = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({
    name: '',
    cnic: '',
    phone: '',
    address: ''
  });
  const [saleData, setSaleData] = useState({
    customer_id: '',
    rikshaw_id: '',
    total_price: 0,
    advance_paid: 0,
    monthly_installment: 0,
    duration_months: 12,
    start_date: format(new Date(), 'yyyy-MM-dd')
  });
  const [installmentSchedule, setInstallmentSchedule] = useState<any[]>([]);
  const [createdSaleDetails, setCreatedSaleDetails] = useState<any>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const planRef = useRef<HTMLDivElement>(null);

  // Fetch customers
  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  // Fetch available rikshaws
  const { data: rikshaws = [], isLoading: rikshawsLoading } = useQuery({
    queryKey: ['available-rikshaws'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rikshaws')
        .select('*')
        .eq('status', 'available')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  // Create new customer mutation
  const createCustomerMutation = useMutation({
    mutationFn: async (customerData: any) => {
      const { data, error } = await supabase
        .from('customers')
        .insert([customerData])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (newCustomer) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setSaleData({...saleData, customer_id: newCustomer.id});
      setIsNewCustomerModalOpen(false);
      setNewCustomerData({
        name: '',
        cnic: '',
        phone: '',
        address: ''
      });
      toast({
        title: "Success",
        description: "Customer created successfully!"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Create installment plan mutation
  const createSaleMutation = useMutation({
    mutationFn: async (saleData: any) => {
      // Create the installment plan
      const { data: plan, error: planError } = await supabase
        .from('installment_plans')
        .insert([{
          customer_id: saleData.customer_id,
          rikshaw_id: saleData.rikshaw_id,
          total_price: saleData.total_price,
          advance_paid: saleData.advance_paid,
          monthly_installment: saleData.monthly_installment,
          duration_months: saleData.duration_months,
          start_date: saleData.start_date
        }])
        .select()
        .single();
      
      if (planError) throw planError;
      
      // Generate installment schedule
      const installmentsToCreate = [];
      const startDate = new Date(saleData.start_date);
      
      for (let i = 1; i <= saleData.duration_months; i++) {
        const dueDate = addMonths(startDate, i);
        installmentsToCreate.push({
          plan_id: plan.id,
          installment_number: i,
          due_date: dueDate.toISOString(),
          amount: saleData.monthly_installment,
          status: 'unpaid'
        });
      }
      
      // Create installments
      const { error: installmentsError } = await supabase
        .from('installments')
        .insert(installmentsToCreate);
      
      if (installmentsError) throw installmentsError;
      
      // Update rikshaw status
      const { error: rikshawError } = await supabase
        .from('rikshaws')
        .update({ status: 'sold' })
        .eq('id', saleData.rikshaw_id);
      
      if (rikshawError) throw rikshawError;
      
      // Get customer and rikshaw details for receipt
      const { data: customer } = await supabase
        .from('customers')
        .select('*')
        .eq('id', saleData.customer_id)
        .single();
      
      const { data: rikshaw } = await supabase
        .from('rikshaws')
        .select('*')
        .eq('id', saleData.rikshaw_id)
        .single();
      
      return {
        plan,
        customer,
        rikshaw
      };
    },
    onSuccess: (saleDetails) => {
      queryClient.invalidateQueries(['installment-plans']);
      queryClient.invalidateQueries(['available-rikshaws']);
      setSaleData({
        customer_id: '',
        rikshaw_id: '',
        total_price: 0,
        advance_paid: 0,
        monthly_installment: 0,
        duration_months: 12,
        start_date: format(new Date(), 'yyyy-MM-dd')
      });
      setInstallmentSchedule([]);
      setCreatedSaleDetails(saleDetails);
      toast({
        title: "Sale Completed!",
        description: "Rickshaw sold and installment plan created successfully!"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Handle rikshaw selection
  const handleRikshawSelect = (rikshawId: string) => {
    const selectedRikshaw = rikshaws.find(r => r.id === rikshawId);
    if (selectedRikshaw) {
      const totalPrice = selectedRikshaw.price;
      setSaleData({
        ...saleData,
        rikshaw_id: rikshawId,
        total_price: totalPrice
      });
    }
  };

  // Calculate remaining balance and monthly installment
  useEffect(() => {
    if (saleData.rikshaw_id && saleData.advance_paid && saleData.duration_months) {
      const totalPrice = saleData.total_price;
      const advancePaid = saleData.advance_paid;
      const remaining = totalPrice - advancePaid;
      const monthly = remaining / saleData.duration_months;
      
      setSaleData({
        ...saleData,
        monthly_installment: parseFloat(monthly.toFixed(2))
      });
    }
  }, [saleData.advance_paid, saleData.duration_months, saleData.rikshaw_id]);

  // Generate installment schedule
  useEffect(() => {
    if (saleData.monthly_installment > 0 && saleData.duration_months > 0) {
      const schedule = [];
      const startDate = new Date(saleData.start_date);
      
      for (let i = 1; i <= saleData.duration_months; i++) {
        const dueDate = addMonths(startDate, i);
        schedule.push({
          month: i,
          due_date: format(dueDate, 'dd MMM yyyy'),
          amount: saleData.monthly_installment.toLocaleString(),
          status: 'Pending'
        });
      }
      
      setInstallmentSchedule(schedule);
    }
  }, [saleData.monthly_installment, saleData.duration_months, saleData.start_date]);

  // Handle form submission
  const handleSellRickshaw = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!saleData.customer_id || !saleData.rikshaw_id) {
      toast({
        title: "Error",
        description: "Please select a customer and a rickshaw",
        variant: "destructive"
      });
      return;
    }
    
    if (saleData.advance_paid <= 0) {
      toast({
        title: "Error",
        description: "Advance payment must be greater than 0",
        variant: "destructive"
      });
      return;
    }
    
    createSaleMutation.mutate(saleData);
  };

  // Handle new customer creation
  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    createCustomerMutation.mutate(newCustomerData);
  };

// Update the downloadReceipt and printInstallmentPlan functions
const downloadReceipt = async () => {
  if (!receiptRef.current || !createdSaleDetails) return;

  try {
    const canvas = await html2canvas(receiptRef.current);
    const imgData = canvas.toDataURL('image/jpeg', 1.0); // Use JPEG format explicitly
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    
    pdf.save(`sale-receipt-${createdSaleDetails.plan.id}.pdf`);
  } catch (error) {
    console.error('Error generating receipt:', error);
    toast({
      title: "Error",
      description: "Failed to generate receipt",
      variant: "destructive"
    });
  }
};

const printInstallmentPlan = async () => {
  if (!planRef.current || !createdSaleDetails) return;

  try {
    const canvas = await html2canvas(planRef.current);
    const imgData = canvas.toDataURL('image/jpeg', 1.0); // Use JPEG format explicitly
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`installment-plan-${createdSaleDetails.plan.id}.pdf`);
  } catch (error) {
    console.error('Error generating installment plan:', error);
    toast({
      title: "Error",
      description: "Failed to generate installment plan",
      variant: "destructive"
    });
  }
};
  // Start a new sale
  const startNewSale = () => {
    setCreatedSaleDetails(null);
    setSaleData({
      customer_id: '',
      rikshaw_id: '',
      total_price: 0,
      advance_paid: 0,
      monthly_installment: 0,
      duration_months: 12,
      start_date: format(new Date(), 'yyyy-MM-dd')
    });
  };

  return (
    <div className="space-y-6">
      {/* Hidden elements for PDF generation */}
      <div className="hidden">
        {/* Sales Receipt */}
        <div ref={receiptRef} className="p-8 bg-white">
          {createdSaleDetails && (
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold">Sale Receipt</h1>
                <p className="text-gray-500">Receipt ID: {createdSaleDetails.plan.id}</p>
                <p className="text-gray-500">Date: {format(new Date(), 'dd MMM yyyy')}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-6 mb-8">
                <div>
                  <h2 className="text-xl font-semibold mb-2">Customer Details</h2>
                  <p><strong>Name:</strong> {createdSaleDetails.customer.name}</p>
                  <p><strong>CNIC:</strong> {createdSaleDetails.customer.cnic}</p>
                  <p><strong>Phone:</strong> {createdSaleDetails.customer.phone}</p>
                  <p><strong>Address:</strong> {createdSaleDetails.customer.address}</p>
                </div>
                
                <div>
                  <h2 className="text-xl font-semibold mb-2">Rickshaw Details</h2>
                  <p><strong>Model:</strong> {createdSaleDetails.rikshaw.model}</p>
                  <p><strong>Engine No:</strong> {createdSaleDetails.rikshaw.engine_number}</p>
                  <p><strong>Price:</strong> Rs {createdSaleDetails.rikshaw.price.toLocaleString()}</p>
                </div>
              </div>
              
              <div className="mb-8">
                <h2 className="text-xl font-semibold mb-4">Payment Details</h2>
                <div className="grid grid-cols-3 gap-4">
                  <div className="border p-4 rounded-lg">
                    <p className="font-medium">Total Price</p>
                    <p className="text-xl">Rs {createdSaleDetails.plan.total_price.toLocaleString()}</p>
                  </div>
                  <div className="border p-4 rounded-lg">
                    <p className="font-medium">Advance Paid</p>
                    <p className="text-xl">Rs {createdSaleDetails.plan.advance_paid.toLocaleString()}</p>
                  </div>
                  <div className="border p-4 rounded-lg">
                    <p className="font-medium">Remaining</p>
                    <p className="text-xl">Rs {(createdSaleDetails.plan.total_price - createdSaleDetails.plan.advance_paid).toLocaleString()}</p>
                  </div>
                </div>
              </div>
              
              <div className="text-center mt-12 pt-8 border-t">
                <p>Thank you for your business!</p>
                <p className="text-sm text-gray-500">This is an official receipt for your records</p>
              </div>
            </div>
          )}
        </div>
        
        {/* Installment Plan */}
        <div ref={planRef} className="p-8 bg-white">
          {createdSaleDetails && (
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold">Installment Plan</h1>
                <p className="text-gray-500">Plan ID: {createdSaleDetails.plan.id}</p>
                <p className="text-gray-500">Start Date: {format(new Date(createdSaleDetails.plan.start_date), 'dd MMM yyyy')}</p>
              </div>
              
              <div className="mb-6">
                <div className="flex justify-between mb-4">
                  <div>
                    <p><strong>Customer:</strong> {createdSaleDetails.customer.name}</p>
                    <p><strong>CNIC:</strong> {createdSaleDetails.customer.cnic}</p>
                  </div>
                  <div>
                    <p><strong>Rickshaw:</strong> {createdSaleDetails.rikshaw.model}</p>
                    <p><strong>Engine No:</strong> {createdSaleDetails.rikshaw.engine_number}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="border p-3 rounded-lg">
                    <p className="font-medium">Total Price</p>
                    <p>Rs {createdSaleDetails.plan.total_price.toLocaleString()}</p>
                  </div>
                  <div className="border p-3 rounded-lg">
                    <p className="font-medium">Advance Paid</p>
                    <p>Rs {createdSaleDetails.plan.advance_paid.toLocaleString()}</p>
                  </div>
                  <div className="border p-3 rounded-lg">
                    <p className="font-medium">Monthly Payment</p>
                    <p>Rs {createdSaleDetails.plan.monthly_installment.toLocaleString()}</p>
                  </div>
                </div>
              </div>
              
              <h2 className="text-xl font-semibold mb-4">Payment Schedule</h2>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-gray-100">
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {installmentSchedule.map((installment, index) => (
                      <TableRow key={index}>
                        <TableCell>{installment.month}</TableCell>
                        <TableCell>{installment.due_date}</TableCell>
                        <TableCell>Rs {installment.amount}</TableCell>
                        <TableCell>
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">
                            {installment.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              <div className="mt-8 pt-6 border-t">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">Total Amount: Rs {createdSaleDetails.plan.total_price.toLocaleString()}</p>
                    <p className="font-medium">Remaining Balance: Rs {(createdSaleDetails.plan.total_price - createdSaleDetails.plan.advance_paid).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p>Signature: ___________________</p>
                    <p className="text-sm text-gray-500">Customer</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Sell Rickshaw</h1>
        <div className="text-sm text-muted-foreground">
          Complete rickshaw sales with installment plans
        </div>
      </div>

      {createdSaleDetails ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Check className="h-6 w-6 text-green-600" />
              Sale Completed Successfully!
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <h3 className="text-lg font-semibold mb-2">Customer Details</h3>
                <p><strong>Name:</strong> {createdSaleDetails.customer.name}</p>
                <p><strong>CNIC:</strong> {createdSaleDetails.customer.cnic}</p>
                <p><strong>Phone:</strong> {createdSaleDetails.customer.phone}</p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-2">Rickshaw Details</h3>
                <p><strong>Model:</strong> {createdSaleDetails.rikshaw.model}</p>
                <p><strong>Engine No:</strong> {createdSaleDetails.rikshaw.engine_number}</p>
                <p><strong>Price:</strong> Rs {createdSaleDetails.rikshaw.price.toLocaleString()}</p>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="border p-4 rounded-lg">
                <p className="font-medium">Advance Paid</p>
                <p className="text-xl">Rs {createdSaleDetails.plan.advance_paid.toLocaleString()}</p>
              </div>
              <div className="border p-4 rounded-lg">
                <p className="font-medium">Monthly Installment</p>
                <p className="text-xl">Rs {createdSaleDetails.plan.monthly_installment.toLocaleString()}</p>
              </div>
              <div className="border p-4 rounded-lg">
                <p className="font-medium">Duration</p>
                <p className="text-xl">{createdSaleDetails.plan.duration_months} months</p>
              </div>
            </div>
            
            <div className="flex gap-3 justify-center mt-8">
              <Button 
                onClick={downloadReceipt}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Download Receipt
              </Button>
              <Button 
                variant="secondary"
                onClick={printInstallmentPlan}
                className="flex items-center gap-2"
              >
                <Printer className="h-4 w-4" />
                Print Installment Plan
              </Button>
              <Button 
                variant="outline"
                onClick={startNewSale}
              >
                New Sale
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Customer and Rickshaw Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Customer & Rickshaw Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>Select Customer</Label>
                <div className="flex gap-2">
                  <Select 
                    value={saleData.customer_id} 
                    onValueChange={(value) => setSaleData({...saleData, customer_id: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map(customer => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name} ({customer.cnic})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button 
                    variant="secondary"
                    onClick={() => setIsNewCustomerModalOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    New
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <Label>Select Rickshaw</Label>
                <Select 
                  value={saleData.rikshaw_id} 
                  onValueChange={handleRikshawSelect}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a rickshaw" />
                  </SelectTrigger>
                  <SelectContent>
                    {rikshaws.map(rikshaw => (
                      <SelectItem key={rikshaw.id} value={rikshaw.id}>
                        {rikshaw.model} (ENG: {rikshaw.engine_number}) - Rs {rikshaw.price.toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {saleData.rikshaw_id && (
                <div className="space-y-4 pt-4 border-t">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Total Price (Rs)</Label>
                      <Input
                        value={saleData.total_price.toLocaleString()}
                        disabled
                      />
                    </div>
                    <div>
                      <Label>Advance Paid (Rs)</Label>
                      <Input
                        type="number"
                        value={saleData.advance_paid}
                        onChange={(e) => setSaleData({
                          ...saleData, 
                          advance_paid: parseFloat(e.target.value) || 0
                        })}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Duration (Months)</Label>
                      <Select 
                        value={saleData.duration_months.toString()} 
                        onValueChange={(value) => setSaleData({
                          ...saleData, 
                          duration_months: parseInt(value)
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select duration" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="6">6 Months</SelectItem>
                          <SelectItem value="12">12 Months</SelectItem>
                          <SelectItem value="18">18 Months</SelectItem>
                          <SelectItem value="24">24 Months</SelectItem>
                          <SelectItem value="36">36 Months</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Start Date</Label>
                      <Input
                        type="date"
                        value={saleData.start_date}
                        onChange={(e) => setSaleData({
                          ...saleData, 
                          start_date: e.target.value
                        })}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label>Monthly Installment (Rs)</Label>
                    <Input
                      value={saleData.monthly_installment.toLocaleString()}
                      disabled
                    />
                  </div>
                  
                  <div className="pt-4">
                    <Label>Remaining Balance (Rs)</Label>
                    <div className="text-2xl font-bold">
                      Rs {(saleData.total_price - saleData.advance_paid).toLocaleString()}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Installment Schedule */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Installment Schedule
              </CardTitle>
            </CardHeader>
            <CardContent>
              {installmentSchedule.length > 0 ? (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Amount (Rs)</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {installmentSchedule.map((installment) => (
                        <TableRow key={installment.month}>
                          <TableCell>{installment.month}</TableCell>
                          <TableCell>{installment.due_date}</TableCell>
                          <TableCell>{installment.amount}</TableCell>
                          <TableCell>
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">
                              {installment.status}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <DollarSign className="h-12 w-12 mb-4" />
                  <p>Complete the form to generate installment schedule</p>
                </div>
              )}
              
              {installmentSchedule.length > 0 && (
                <div className="mt-6 flex justify-end">
                  <Button 
                    size="lg" 
                    onClick={handleSellRickshaw}
                    disabled={createSaleMutation.isLoading}
                  >
                    {createSaleMutation.isLoading ? (
                      "Processing Sale..."
                    ) : (
                      <>
                        <Check className="h-5 w-5 mr-2" />
                        Complete Sale
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* New Customer Modal */}
      {isNewCustomerModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <User className="h-5 w-5" />
              Create New Customer
            </h3>
            
            <form onSubmit={handleCreateCustomer} className="space-y-4">
              <div>
                <Label>Full Name *</Label>
                <Input
                  value={newCustomerData.name}
                  onChange={(e) => setNewCustomerData({...newCustomerData, name: e.target.value})}
                  required
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>CNIC *</Label>
                  <Input
                    value={newCustomerData.cnic}
                    onChange={(e) => setNewCustomerData({...newCustomerData, cnic: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <Label>Phone *</Label>
                  <Input
                    value={newCustomerData.phone}
                    onChange={(e) => setNewCustomerData({...newCustomerData, phone: e.target.value})}
                    required
                  />
                </div>
              </div>
              
              <div>
                <Label>Address</Label>
                <Input
                  value={newCustomerData.address}
                  onChange={(e) => setNewCustomerData({...newCustomerData, address: e.target.value})}
                />
              </div>
              
              <div className="flex justify-end gap-3 pt-4">
                <Button 
                  variant="outline" 
                  type="button"
                  onClick={() => setIsNewCustomerModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={createCustomerMutation.isLoading}
                >
                  {createCustomerMutation.isLoading ? "Creating..." : "Create Customer"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SellRickshaw;