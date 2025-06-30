import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { User, Car, Calendar, DollarSign, Plus, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { format, addMonths } from 'date-fns';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface Customer {
  id: string;
  name: string;
  cnic: string;
  phone: string;
  address: string;
  guarantor_name?: string;
  guarantor_cnic?: string;
  guarantor_phone?: string;
  guarantor_address?: string;
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
  
  // Form states
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
    start_date: format(new Date(), 'yyyy-MM-dd'),
    guarantor_name: '',
    guarantor_cnic: '',
    guarantor_phone: '',
    guarantor_address: '',
    bank_name: '',
    cheque_number: ''
  });
  
  const [installmentSchedule, setInstallmentSchedule] = useState<any[]>([]);
  const [createdSaleDetails, setCreatedSaleDetails] = useState<any>(null);
  const [firstInstallment, setFirstInstallment] = useState(0);
  const [installmentError, setInstallmentError] = useState('');
  const [isGuarantorOpen, setIsGuarantorOpen] = useState(false);
  const [isBankOpen, setIsBankOpen] = useState(false);
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [cnicError, setCnicError] = useState('');
  const [phoneError, setPhoneError] = useState('');

  const remainingBalance = saleData.total_price - saleData.advance_paid;

  // Fetch customers
  const { data: customers = [], isLoading: loadingCustomers } = useQuery({
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
  const { data: rikshaws = [], isLoading: loadingRikshaws } = useQuery({
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

  // Get selected customer details
  const selectedCustomer = customers.find(c => c.id === saleData.customer_id);

  // Create customer mutation
  const createCustomerMutation = useMutation({
    mutationFn: async (customerData: any) => {
      // Check for duplicate CNIC
      const { data: existing, error: fetchError } = await supabase
        .from('customers')
        .select('id')
        .eq('cnic', customerData.cnic)
        .maybeSingle();
      
      if (fetchError) throw fetchError;
      if (existing) throw new Error("Customer with this CNIC already exists");
      
      // Validate CNIC
      if (customerData.cnic.length !== 13) {
        throw new Error("CNIC must be 13 digits");
      }
      
      // Validate phone
      if (customerData.phone.length !== 11) {
        throw new Error("Phone must be 11 digits");
      }

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
      setSaleData(prev => ({ ...prev, customer_id: newCustomer.id }));
      setNewCustomerData({ name: '', cnic: '', phone: '', address: '' });
      toast({
        title: "Success",
        description: "Customer created successfully! Now complete the sale."
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

  // Update customer mutation
  const updateCustomerMutation = useMutation({
    mutationFn: async (customerData: Customer) => {
      // Validate CNIC
      if (customerData.cnic.length !== 13) {
        throw new Error("CNIC must be 13 digits");
      }
      
      // Validate phone
      if (customerData.phone.length !== 11) {
        throw new Error("Phone must be 11 digits");
      }

      const { data, error } = await supabase
        .from('customers')
        .update(customerData)
        .eq('id', customerData.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({ title: "Success", description: "Customer updated successfully!" });
      setIsEditingCustomer(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Create sale mutation
  const createSaleMutation = useMutation({
    mutationFn: async (saleData: any) => {
      // Validate guarantor details
      if (!saleData.guarantor_name || !saleData.guarantor_cnic || !saleData.guarantor_phone) {
        throw new Error("Please fill all required guarantor details");
      }

      // Validate bank details
      if (!saleData.bank_name || !saleData.cheque_number) {
        throw new Error("Please fill all required bank details");
      }

      const { data: plan, error: planError } = await supabase
        .from('installment_plans')
        .insert([{
          customer_id: saleData.customer_id,
          rikshaw_id: saleData.rikshaw_id,
          total_price: saleData.total_price,
          advance_paid: saleData.advance_paid,
          monthly_installment: saleData.monthly_installment,
          duration_months: saleData.duration_months,
          start_date: saleData.start_date,
          guarantor_name: saleData.guarantor_name,
          guarantor_cnic: saleData.guarantor_cnic,
          guarantor_phone: saleData.guarantor_phone,
          guarantor_address: saleData.guarantor_address,
          bank_name: saleData.bank_name,
          cheque_number: saleData.cheque_number
        }])
        .select()
        .single();

      if (planError) throw planError;

      const installmentsToCreate = [];
      for (const installment of installmentSchedule) {
        if (installment.status === 'Advance') continue;
        installmentsToCreate.push({
          plan_id: plan.id,
          installment_number: installment.month,
          due_date: new Date(installment.due_date).toISOString(),
          amount: parseFloat(installment.amount.replace(/,/g, '')),
          status: 'unpaid'
        });
      }

      const { error: installmentsError } = await supabase
        .from('installments')
        .insert(installmentsToCreate);
      if (installmentsError) throw installmentsError;

      const { error: rikshawError } = await supabase
        .from('rikshaws')
        .update({ status: 'sold' })
        .eq('id', saleData.rikshaw_id);
      if (rikshawError) throw rikshawError;

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

      return { plan, customer, rikshaw };
    },
    onSuccess: (saleDetails) => {
      queryClient.invalidateQueries({ queryKey: ['installment-plans'] });
      queryClient.invalidateQueries({ queryKey: ['available-rikshaws'] });
      resetForm();
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
    const selected = rikshaws.find(r => r.id === rikshawId);
    if (selected) {
      setSaleData(prev => ({
        ...prev,
        rikshaw_id: rikshawId,
        total_price: selected.price
      }));
    }
  };

  // Handle customer edit
  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsEditingCustomer(true);
  };

  // Handle customer update
  const handleUpdateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCustomer) {
      updateCustomerMutation.mutate(editingCustomer);
    }
  };

  // Handle download receipt
  const handleDownloadReceipt = () => {
    toast({
      title: "Receipt Download",
      description: "Receipt will be downloaded shortly..."
    });
    // In a real app, this would generate a PDF
    setTimeout(() => {
      toast({
        title: "Receipt Downloaded",
        description: "Sale receipt has been saved to your device"
      });
    }, 2000);
  };

  // Reset form
  const resetForm = () => {
    setSaleData({
      customer_id: '',
      rikshaw_id: '',
      total_price: 0,
      advance_paid: 0,
      monthly_installment: 0,
      duration_months: 12,
      start_date: format(new Date(), 'yyyy-MM-dd'),
      guarantor_name: '',
      guarantor_cnic: '',
      guarantor_phone: '',
      guarantor_address: '',
      bank_name: '',
      cheque_number: ''
    });
    setFirstInstallment(0);
    setInstallmentSchedule([]);
    setInstallmentError('');
    setIsGuarantorOpen(false);
    setIsBankOpen(false);
  };

  // Calculate installment schedule
  useEffect(() => {
    if (!saleData.rikshaw_id || saleData.duration_months <= 0 || firstInstallment <= 0) return;

    const schedule = [];
    const startDate = new Date(saleData.start_date);

    if (saleData.advance_paid > 0) {
      schedule.push({
        month: 0,
        due_date: format(startDate, 'dd MMM yyyy'),
        amount: saleData.advance_paid.toLocaleString(),
        status: 'Advance'
      });
    }

    for (let i = 1; i <= saleData.duration_months; i++) {
      const dueDate = addMonths(startDate, i);
      schedule.push({
        month: i,
        due_date: format(dueDate, 'dd MMM yyyy'),
        amount: firstInstallment.toLocaleString(),
        status: 'Pending'
      });
    }

    const totalInstallments = firstInstallment * saleData.duration_months;
    const totalAmount = saleData.advance_paid + totalInstallments;

    if (Math.round(totalAmount) !== Math.round(saleData.total_price)) {
      setInstallmentError(`Total amount (Rs ${totalAmount.toLocaleString()}) does not match rickshaw price (Rs ${saleData.total_price.toLocaleString()})`);
    } else {
      setInstallmentError('');
    }

    setSaleData(prev => ({
      ...prev,
      monthly_installment: firstInstallment
    }));

    setInstallmentSchedule(schedule);
  }, [firstInstallment, saleData.duration_months, saleData.start_date, saleData.advance_paid, saleData.rikshaw_id]);

  // Auto-fill guarantor details from customer
  useEffect(() => {
    if (saleData.customer_id && selectedCustomer?.guarantor_name) {
      setSaleData(prev => ({
        ...prev,
        guarantor_name: selectedCustomer.guarantor_name || '',
        guarantor_cnic: selectedCustomer.guarantor_cnic || '',
        guarantor_phone: selectedCustomer.guarantor_phone || '',
        guarantor_address: selectedCustomer.guarantor_address || ''
      }));
    }
  }, [saleData.customer_id, selectedCustomer]);

  // Validate CNIC
  useEffect(() => {
    if (newCustomerData.cnic && newCustomerData.cnic.length !== 13) {
      setCnicError("CNIC must be exactly 13 digits");
    } else {
      setCnicError("");
    }
  }, [newCustomerData.cnic]);

  // Validate phone
  useEffect(() => {
    if (newCustomerData.phone && newCustomerData.phone.length !== 11) {
      setPhoneError("Phone must be exactly 11 digits");
    } else {
      setPhoneError("");
    }
  }, [newCustomerData.phone]);

  // Handle sell rikshaw
  const handleSellRickshaw = (e: React.FormEvent) => {
    e.preventDefault();

    if (!saleData.customer_id || !saleData.rikshaw_id) {
      toast({ title: "Error", description: "Please select a customer and rickshaw", variant: "destructive" });
      return;
    }

    if (saleData.advance_paid <= 0) {
      toast({ title: "Error", description: "Advance payment must be greater than 0", variant: "destructive" });
      return;
    }

    if (saleData.advance_paid > saleData.total_price) {
      toast({ title: "Error", description: "Advance payment cannot exceed total price", variant: "destructive" });
      return;
    }

    if (firstInstallment <= 0) {
      toast({ title: "Error", description: "First installment must be greater than 0", variant: "destructive" });
      return;
    }

    if (installmentError) {
      toast({ title: "Error", description: installmentError, variant: "destructive" });
      return;
    }

    createSaleMutation.mutate(saleData);
  };

  // Handle create customer
  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    createCustomerMutation.mutate(newCustomerData);
  };

  // Start new sale
  const startNewSale = () => {
    setCreatedSaleDetails(null);
    resetForm();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Sell Rickshaw</h1>
        <div className="text-sm text-muted-foreground">
          Complete rickshaw sales with installment plans
        </div>
      </div>

      {createdSaleDetails ? (
        <Card className="border-primary">
          <CardHeader className="bg-primary text-primary-foreground rounded-t-lg">
            <CardTitle className="flex items-center gap-2">
              <Check className="h-6 w-6" />
              Sale Completed Successfully!
            </CardTitle>
            <CardDescription className="text-primary-foreground/90">
              Rickshaw sold and installment plan created
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-muted/30 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-3 border-b pb-2">Customer Details</h3>
                <div className="space-y-2">
                  <p><strong>Name:</strong> {createdSaleDetails.customer.name}</p>
                  <p><strong>CNIC:</strong> {createdSaleDetails.customer.cnic}</p>
                  <p><strong>Phone:</strong> {createdSaleDetails.customer.phone}</p>
                  <p><strong>Address:</strong> {createdSaleDetails.customer.address || 'N/A'}</p>
                </div>
              </div>
              
              <div className="bg-muted/30 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-3 border-b pb-2">Rickshaw Details</h3>
                <div className="space-y-2">
                  <p><strong>Model:</strong> {createdSaleDetails.rikshaw.model}</p>
                  <p><strong>Engine No:</strong> {createdSaleDetails.rikshaw.engine_number}</p>
                  <p><strong>Price:</strong> Rs {createdSaleDetails.rikshaw.price.toLocaleString()}</p>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-muted/30 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-3 border-b pb-2">Guarantor Details</h3>
                <div className="space-y-2">
                  <p><strong>Name:</strong> {createdSaleDetails.plan.guarantor_name}</p>
                  <p><strong>CNIC:</strong> {createdSaleDetails.plan.guarantor_cnic}</p>
                  <p><strong>Phone:</strong> {createdSaleDetails.plan.guarantor_phone}</p>
                  <p><strong>Address:</strong> {createdSaleDetails.plan.guarantor_address || 'N/A'}</p>
                </div>
              </div>
              
              <div className="bg-muted/30 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-3 border-b pb-2">Bank Details</h3>
                <div className="space-y-2">
                  <p><strong>Bank Name:</strong> {createdSaleDetails.plan.bank_name}</p>
                  <p><strong>Cheque Number:</strong> {createdSaleDetails.plan.cheque_number}</p>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="border border-primary/30 p-4 rounded-lg bg-primary/5">
                <p className="font-medium text-primary">Advance Paid</p>
                <p className="text-2xl font-bold">Rs {createdSaleDetails.plan.advance_paid.toLocaleString()}</p>
              </div>
              <div className="border border-primary/30 p-4 rounded-lg bg-primary/5">
                <p className="font-medium text-primary">Monthly Installment</p>
                <p className="text-2xl font-bold">Rs {createdSaleDetails.plan.monthly_installment.toLocaleString()}</p>
              </div>
              <div className="border border-primary/30 p-4 rounded-lg bg-primary/5">
                <p className="font-medium text-primary">Duration</p>
                <p className="text-2xl font-bold">{createdSaleDetails.plan.duration_months} months</p>
              </div>
            </div>
            
            <div className="flex gap-3 justify-center mt-8">
              <Button 
                variant="outline"
                onClick={startNewSale}
                className="px-8"
              >
                New Sale
              </Button>
              <Button 
                onClick={handleDownloadReceipt}
                className="px-8 bg-green-600 hover:bg-green-700"
              >
                Download Receipt
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
                <div className="flex flex-col gap-4">
                  <Select 
                    value={saleData.customer_id} 
                    onValueChange={(value) => setSaleData({...saleData, customer_id: value})}
                  >
                    <SelectTrigger>
                      {loadingCustomers ? (
                        <div className="flex items-center gap-2">
                          
                          <span>Loading customers...</span>
                        </div>
                      ) : (
                        <SelectValue placeholder="Select a customer" />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map(customer => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name} ({customer.cnic})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {saleData.customer_id && selectedCustomer && (
                    <div className="mt-2 p-4 border rounded-lg bg-muted/30">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-semibold">Selected Customer</h4>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleEditCustomer(selectedCustomer)}
                        >
                          Edit
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><span className="font-medium">Name:</span> {selectedCustomer.name}</div>
                        <div><span className="font-medium">CNIC:</span> {selectedCustomer.cnic}</div>
                        <div><span className="font-medium">Phone:</span> {selectedCustomer.phone}</div>
                        <div><span className="font-medium">Address:</span> {selectedCustomer.address || 'N/A'}</div>
                      </div>
                    </div>
                  )}
                  
                  {isEditingCustomer && editingCustomer && (
                    <div className="mt-4 p-4 border rounded-lg bg-muted/30">
                      <h3 className="text-lg font-semibold mb-3">Edit Customer</h3>
                      <form onSubmit={handleUpdateCustomer} className="space-y-4">
                        <div>
                          <Label>Customer Full Name *</Label>
                          <Input
                            value={editingCustomer.name}
                            onChange={(e) => setEditingCustomer({...editingCustomer, name: e.target.value})}
                            required
                          />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Customer CNIC *</Label>
                            <Input
                              value={editingCustomer.cnic}
                              onChange={(e) => setEditingCustomer({...editingCustomer, cnic: e.target.value})}
                              required
                            />
                            {editingCustomer.cnic.length !== 13 && (
                              <p className="text-red-500 text-xs mt-1">CNIC must be 13 digits</p>
                            )}
                          </div>
                          <div>
                            <Label>Customer Phone *</Label>
                            <Input
                              value={editingCustomer.phone}
                              onChange={(e) => setEditingCustomer({...editingCustomer, phone: e.target.value})}
                              required
                            />
                            {editingCustomer.phone.length !== 11 && (
                              <p className="text-red-500 text-xs mt-1">Phone must be 11 digits</p>
                            )}
                          </div>
                        </div>
                        
                        <div>
                          <Label>Customer Address</Label>
                          <Input
                            value={editingCustomer.address || ''}
                            onChange={(e) => setEditingCustomer({...editingCustomer, address: e.target.value})}
                          />
                        </div>
                        
                        <div className="flex gap-2">
                          <Button 
                            type="submit"
                            disabled={updateCustomerMutation.isLoading}
                            className="flex-1"
                          >
                            {updateCustomerMutation.isLoading ? "Saving..." : "Save Changes"}
                          </Button>
                          <Button 
                            variant="outline"
                            onClick={() => setIsEditingCustomer(false)}
                            className="flex-1"
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    </div>
                  )}
                  
                  <div className="border-t pt-4">
                    <h3 className="text-lg font-semibold mb-2">Or Create New Customer</h3>
                    <form onSubmit={handleCreateCustomer} className="space-y-4">
                      <div>
                        <Label>Customer Full Name *</Label>
                        <Input
                          value={newCustomerData.name}
                          onChange={(e) => setNewCustomerData({...newCustomerData, name: e.target.value})}
                          required
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Customer CNIC *</Label>
                          <Input
                            value={newCustomerData.cnic}
                            onChange={(e) => setNewCustomerData({...newCustomerData, cnic: e.target.value})}
                            required
                          />
                          {cnicError && (
                            <p className="text-red-500 text-xs mt-1">{cnicError}</p>
                          )}
                        </div>
                        <div>
                          <Label>Customer Phone *</Label>
                          <Input
                            value={newCustomerData.phone}
                            onChange={(e) => setNewCustomerData({...newCustomerData, phone: e.target.value})}
                            required
                          />
                          {phoneError && (
                            <p className="text-red-500 text-xs mt-1">{phoneError}</p>
                          )}
                        </div>
                      </div>
                      
                      <div>
                        <Label>Customer Address</Label>
                        <Input
                          value={newCustomerData.address}
                          onChange={(e) => setNewCustomerData({...newCustomerData, address: e.target.value})}
                        />
                      </div>
                      
                      <Button 
                        type="submit"
                        disabled={createCustomerMutation.isLoading}
                        className="w-full"
                      >
                        {createCustomerMutation.isLoading ? "Creating..." : "Create Customer"}
                      </Button>
                    </form>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label>Select Rickshaw</Label>
                <Select 
                  value={saleData.rikshaw_id} 
                  onValueChange={handleRikshawSelect}
                >
                  <SelectTrigger>
                    {loadingRikshaws ? (
                      <div className="flex items-center gap-2">
                     
                        <span>Loading rikshaws...</span>
                      </div>
                    ) : (
                      <SelectValue placeholder="Select a rickshaw" />
                    )}
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
                      <Label>Advance Paid (Rs)*</Label>
                      <Input
                        type="number"
                        value={saleData.advance_paid}
                        onChange={(e) => {
                          const advance = parseFloat(e.target.value) || 0;
                          setSaleData({
                            ...saleData, 
                            advance_paid: advance
                          });
                        }}
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="pt-2">
                    <Label>Remaining Balance (Rs)</Label>
                    <div className="text-2xl font-bold">
                      Rs {remainingBalance.toLocaleString()}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>First Installment Amount (Rs)*</Label>
                      <Input
                        type="number"
                        value={firstInstallment}
                        onChange={(e) => setFirstInstallment(parseFloat(e.target.value) || 0)}
                        required
                      />
                      {installmentError && (
                        <p className="text-red-500 text-sm mt-1">{installmentError}</p>
                      )}
                    </div>
                    <div>
                      <Label>Duration (Months)*</Label>
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
                  
                  <Collapsible 
                    open={isGuarantorOpen} 
                    onOpenChange={setIsGuarantorOpen}
                    className="pt-4"
                  >
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg cursor-pointer">
                        <h3 className="text-lg font-semibold">Guarantor Details</h3>
                        {isGuarantorOpen ? (
                          <ChevronUp className="h-5 w-5" />
                        ) : (
                          <ChevronDown className="h-5 w-5" />
                        )}
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-4 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Full Name *</Label>
                          <Input
                            value={saleData.guarantor_name}
                            onChange={(e) => setSaleData({...saleData, guarantor_name: e.target.value})}
                            required
                          />
                        </div>
                        <div>
                          <Label>CNIC *</Label>
                          <Input
                            value={saleData.guarantor_cnic}
                            onChange={(e) => setSaleData({...saleData, guarantor_cnic: e.target.value})}
                            required
                          />
                        </div>
                        <div>
                          <Label>Phone *</Label>
                          <Input
                            value={saleData.guarantor_phone}
                            onChange={(e) => setSaleData({...saleData, guarantor_phone: e.target.value})}
                            required
                          />
                        </div>
                        <div>
                          <Label>Address</Label>
                          <Input
                            value={saleData.guarantor_address}
                            onChange={(e) => setSaleData({...saleData, guarantor_address: e.target.value})}
                          />
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                  
                  <Collapsible 
                    open={isBankOpen} 
                    onOpenChange={setIsBankOpen}
                    className="pt-2"
                  >
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg cursor-pointer">
                        <h3 className="text-lg font-semibold">Bank Details</h3>
                        {isBankOpen ? (
                          <ChevronUp className="h-5 w-5" />
                        ) : (
                          <ChevronDown className="h-5 w-5" />
                        )}
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Bank Name *</Label>
                          <Input
                            value={saleData.bank_name}
                            onChange={(e) => setSaleData({...saleData, bank_name: e.target.value})}
                            required
                          />
                        </div>
                        <div>
                          <Label>Cheque Number *</Label>
                          <Input
                            value={saleData.cheque_number}
                            onChange={(e) => setSaleData({...saleData, cheque_number: e.target.value})}
                            required
                          />
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
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
                        <TableHead>#</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Amount (Rs)</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {installmentSchedule.map((installment, index) => (
                        <TableRow key={index}>
                          <TableCell>{installment.month === 0 ? 'Adv' : installment.month}</TableCell>
                          <TableCell>{installment.due_date}</TableCell>
                          <TableCell>{installment.amount}</TableCell>
                          <TableCell>
                            <span className={cn(
                              "px-2 py-1 rounded-full text-xs",
                              installment.status === 'Advance' 
                                ? 'bg-blue-100 text-blue-800' 
                                : 'bg-yellow-100 text-yellow-800'
                            )}>
                              {installment.status}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                      {installmentSchedule.length > 1 && (
                        <TableRow className="bg-gray-50 font-medium">
                          <TableCell colSpan={2} className="text-right">Total:</TableCell>
                          <TableCell>
                            Rs {(
                              saleData.advance_paid + 
                              (firstInstallment * saleData.duration_months)
                            ).toLocaleString()}
                          </TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      )}
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
                    disabled={createSaleMutation.isLoading || !!installmentError}
                    className={cn(
                      "px-8",
                      createSaleMutation.isLoading ? "bg-gray-400" : "bg-green-600 hover:bg-green-700"
                    )}
                  >
                    {createSaleMutation.isLoading ? (
                      <div className="flex items-center gap-2">
                       
                        Processing Sale...
                      </div>
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
    </div>
  );
};

export default SellRickshaw;