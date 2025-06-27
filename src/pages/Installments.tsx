import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, Check, Calendar, DollarSign, User, Car, Search } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, addMonths } from 'date-fns';
import { Badge } from '@/components/ui/badge';

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

interface InstallmentPlan {
  id: string;
  customer_id: string;
  rikshaw_id: string;
  total_price: number;
  advance_paid: number;
  monthly_installment: number;
  duration_months: number;
  start_date: string;
  created_at: string;
  customers: Customer;
  rikshaws: Rikshaw;
}

interface Installment {
  id: string;
  plan_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  status: 'paid' | 'unpaid';
  paid_date: string | null;
  payment_method: 'cash' | 'bank' | null;
  collector: string | null;
}

const InstallmentsPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<InstallmentPlan | null>(null);
  const [formData, setFormData] = useState({
    customer_id: '',
    rikshaw_id: '',
    total_price: '',
    advance_paid: '',
    monthly_installment: '',
    duration_months: '12',
    start_date: format(new Date(), 'yyyy-MM-dd')
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch customers
  const { data: customers = [] } = useQuery({
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
  const { data: rikshaws = [] } = useQuery({
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

  // Fetch installment plans with customer and rikshaw details
  const { data: installmentPlans = [], isLoading } = useQuery({
    queryKey: ['installment-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('installment_plans')
        .select(`
          *,
          customers:customer_id (id, name, cnic, phone),
          rikshaws:rikshaw_id (id, model, engine_number, price)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  // Fetch installments for a specific plan
  const { data: installments = [] } = useQuery({
    queryKey: ['installments', selectedPlan?.id],
    queryFn: async () => {
      if (!selectedPlan) return [];
      
      const { data, error } = await supabase
        .from('installments')
        .select('*')
        .eq('plan_id', selectedPlan.id)
        .order('installment_number', { ascending: true });
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedPlan
  });

  // Create installment plan mutation
  const createPlanMutation = useMutation({
    mutationFn: async (planData: any) => {
      // Create the installment plan
      const { data: plan, error: planError } = await supabase
        .from('installment_plans')
        .insert([{
          customer_id: planData.customer_id,
          rikshaw_id: planData.rikshaw_id,
          total_price: parseFloat(planData.total_price),
          advance_paid: parseFloat(planData.advance_paid),
          monthly_installment: parseFloat(planData.monthly_installment),
          duration_months: parseInt(planData.duration_months),
          start_date: planData.start_date
        }])
        .select()
        .single();
      
      if (planError) throw planError;
      
      // Generate installment schedule
      const installmentsToCreate = [];
      const startDate = new Date(planData.start_date);
      
      for (let i = 1; i <= parseInt(planData.duration_months); i++) {
        const dueDate = addMonths(startDate, i);
        installmentsToCreate.push({
          plan_id: plan.id,
          installment_number: i,
          due_date: dueDate.toISOString(),
          amount: parseFloat(planData.monthly_installment),
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
        .eq('id', planData.rikshaw_id);
      
      if (rikshawError) throw rikshawError;
      
      return plan;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['installment-plans']);
      queryClient.invalidateQueries(['available-rikshaws']);
      setIsAddDialogOpen(false);
      resetForm();
      toast({
        title: "Success",
        description: "Installment plan created successfully!"
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

  // Mark installment as paid
  const markPaidMutation = useMutation({
    mutationFn: async ({ installmentId, paymentMethod }: { installmentId: string; paymentMethod: 'cash' | 'bank' }) => {
      const { data, error } = await supabase
        .from('installments')
        .update({
          status: 'paid',
          paid_date: new Date().toISOString(),
          payment_method: paymentMethod,
          collector: 'Admin' // In real app, get current user name
        })
        .eq('id', installmentId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['installments', selectedPlan?.id]);
      toast({
        title: "Success",
        description: "Installment marked as paid!"
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

  const resetForm = () => {
    setFormData({
      customer_id: '',
      rikshaw_id: '',
      total_price: '',
      advance_paid: '',
      monthly_installment: '',
      duration_months: '12',
      start_date: format(new Date(), 'yyyy-MM-dd')
    });
  };

  const handleCreatePlan = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.customer_id || !formData.rikshaw_id || 
        !formData.total_price || !formData.advance_paid || 
        !formData.monthly_installment) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }
    
    createPlanMutation.mutate(formData);
  };

  const handleRikshawChange = (rikshawId: string) => {
    const selectedRikshaw = rikshaws.find(r => r.id === rikshawId);
    if (selectedRikshaw) {
      setFormData({
        ...formData,
        rikshaw_id: rikshawId,
        total_price: selectedRikshaw.price.toString()
      });
    }
  };

  const handleViewDetails = (plan: InstallmentPlan) => {
    setSelectedPlan(plan);
    setIsDetailDialogOpen(true);
  };

  const handleMarkPaid = (installmentId: string, method: 'cash' | 'bank') => {
    markPaidMutation.mutate({ installmentId, paymentMethod: method });
  };

  const filteredPlans = installmentPlans.filter(plan => {
    const customerName = plan.customers?.name?.toLowerCase() || '';
    const rikshawModel = plan.rikshaws?.model?.toLowerCase() || '';
    return (
      customerName.includes(searchTerm.toLowerCase()) ||
      rikshawModel.includes(searchTerm.toLowerCase())
    );
  });

  // Calculate remaining balance
  const calculateRemainingBalance = (plan: InstallmentPlan) => {
    const totalAmount = plan.total_price - plan.advance_paid;
    return totalAmount.toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Installment Plans</h1>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Create Plan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Installment Plan</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreatePlan} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Customer Selection */}
                <div className="space-y-4">
                  <div>
                    <Label>Customer *</Label>
                    <Select 
                      value={formData.customer_id} 
                      onValueChange={(value) => setFormData({...formData, customer_id: value})}
                      required
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
                  </div>
                  
                  {/* Rikshaw Selection */}
                  <div>
                    <Label>Rikshaw *</Label>
                    <Select 
                      value={formData.rikshaw_id} 
                      onValueChange={handleRikshawChange}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a rikshaw" />
                      </SelectTrigger>
                      <SelectContent>
                        {rikshaws.map(rikshaw => (
                          <SelectItem key={rikshaw.id} value={rikshaw.id}>
                            {rikshaw.model} (ENG: {rikshaw.engine_number})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Start Date */}
                  <div>
                    <Label>Start Date *</Label>
                    <Input
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                      required
                    />
                  </div>
                </div>
                
                {/* Payment Details */}
                <div className="space-y-4">
                  <div>
                    <Label>Total Price (Rs) *</Label>
                    <Input
                      type="number"
                      value={formData.total_price}
                      onChange={(e) => setFormData({...formData, total_price: e.target.value})}
                      required
                      disabled
                    />
                  </div>
                  
                  <div>
                    <Label>Advance Paid (Rs) *</Label>
                    <Input
                      type="number"
                      value={formData.advance_paid}
                      onChange={(e) => setFormData({...formData, advance_paid: e.target.value})}
                      required
                    />
                  </div>
                  
                  <div>
                    <Label>Monthly Installment (Rs) *</Label>
                    <Input
                      type="number"
                      value={formData.monthly_installment}
                      onChange={(e) => setFormData({...formData, monthly_installment: e.target.value})}
                      required
                    />
                  </div>
                  
                  <div>
                    <Label>Duration (Months) *</Label>
                    <Select 
                      value={formData.duration_months} 
                      onValueChange={(value) => setFormData({...formData, duration_months: value})}
                      required
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
              </div>
              
              <div className="flex justify-end gap-3">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsAddDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createPlanMutation.isLoading}
                >
                  {createPlanMutation.isLoading ? "Creating..." : "Create Plan"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4" />
            <Input
              placeholder="Search plans by customer or rikshaw..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading installment plans...</div>
          ) : filteredPlans.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <DollarSign className="h-12 w-12 mx-auto mb-4" />
              <p className="text-lg font-medium">No installment plans found</p>
              <p className="mt-2">
                {searchTerm 
                  ? "Try adjusting your search" 
                  : "Create your first installment plan to get started"
                }
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Rikshaw</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead>Advance Paid</TableHead>
                  <TableHead>Installment</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlans.map(plan => (
                  <TableRow key={plan.id}>
                    <TableCell>
                      <div className="font-medium">{plan.customers?.name}</div>
                      <div className="text-sm text-muted-foreground">{plan.customers?.phone}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{plan.rikshaws?.model}</div>
                      <div className="text-sm text-muted-foreground">ENG: {plan.rikshaws?.engine_number}</div>
                    </TableCell>
                    <TableCell>{format(new Date(plan.start_date), 'dd MMM yyyy')}</TableCell>
                    <TableCell>Rs {plan.total_price.toLocaleString()}</TableCell>
                    <TableCell>Rs {plan.advance_paid.toLocaleString()}</TableCell>
                    <TableCell>Rs {plan.monthly_installment.toLocaleString()}/mo</TableCell>
                    <TableCell>{plan.duration_months} months</TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="outline"
                        onClick={() => handleViewDetails(plan)}
                      >
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Installment Plan Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Installment Plan Details
            </DialogTitle>
          </DialogHeader>
          
          {selectedPlan && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <User className="h-6 w-6" />
                      <h3 className="font-semibold">Customer Information</h3>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <p className="font-medium">{selectedPlan.customers?.name}</p>
                      <p>CNIC: {selectedPlan.customers?.cnic}</p>
                      <p>Phone: {selectedPlan.customers?.phone}</p>
                      <p>Address: {selectedPlan.customers?.address}</p>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <Car className="h-6 w-6" />
                      <h3 className="font-semibold">Rikshaw Information</h3>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <p className="font-medium">{selectedPlan.rikshaws?.model}</p>
                      <p>Engine: {selectedPlan.rikshaws?.engine_number}</p>
                      <p>Total Price: Rs {selectedPlan.total_price.toLocaleString()}</p>
                      <p>Advance Paid: Rs {selectedPlan.advance_paid.toLocaleString()}</p>
                      <p>Remaining Balance: Rs {calculateRemainingBalance(selectedPlan)}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-6 w-6" />
                    <h3 className="font-semibold">Payment Schedule</h3>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Payment Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {installments.map(installment => (
                        <TableRow key={installment.id}>
                          <TableCell>{installment.installment_number}</TableCell>
                          <TableCell>{format(new Date(installment.due_date), 'dd MMM yyyy')}</TableCell>
                          <TableCell>Rs {installment.amount.toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge 
                              variant={installment.status === 'paid' ? 'default' : 'destructive'}
                              className="capitalize"
                            >
                              {installment.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {installment.paid_date 
                              ? format(new Date(installment.paid_date), 'dd MMM yyyy') 
                              : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            {installment.status === 'unpaid' && (
                              <div className="flex gap-2 justify-end">
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => handleMarkPaid(installment.id, 'cash')}
                                  disabled={markPaidMutation.isLoading}
                                >
                                  <Check className="h-4 w-4 mr-1" />
                                  Cash
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => handleMarkPaid(installment.id, 'bank')}
                                  disabled={markPaidMutation.isLoading}
                                >
                                  <Check className="h-4 w-4 mr-1" />
                                  Bank
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InstallmentsPage;