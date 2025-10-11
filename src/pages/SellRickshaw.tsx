import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// 🛑 FIX: Added missing Table components that were causing the blank screen
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Car, Calendar, DollarSign, Check, ChevronDown, ChevronUp, Plus, X, Search, DollarSign as DollarSignIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils'; // Assuming cn is a utility for Tailwind class merging

// Define interfaces for Customer, Rikshaw, and AdvancePayment
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
}

interface AdvancePayment {
  amount: number;
  date: string;
}

const SellRickshaw = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State for sale data, including the new showroom_commission field
  const [saleData, setSaleData] = useState({
    customer_id: '',
    rikshaw_id: '',
    total_price: 0,
    total_advance_collected: 0,
    monthly_installment: 0,
    duration_months: 12, // Default duration
    agreement_date: new Date().toISOString().split('T')[0],
    showroom_commission: 0, 
  });
  
  // State for commission payment status
  const [isCommissionPaid, setIsCommissionPaid] = useState(false); // NEW STATE
  
  // State for individual advance payments
  const [advancePayments, setAdvancePayments] = useState<AdvancePayment[]>([
    { amount: 0, date: new Date().toISOString().split('T')[0] }
  ]);
  
  // State to store details of the created sale for receipt generation
  const [createdSaleDetails, setCreatedSaleDetails] = useState<any>(null);
  // State to manage submission loading
  const [isSubmitting, setIsSubmitting] = useState(false);
  // State to toggle between form and preview
  const [showPreview, setShowPreview] = useState(false);

  // New state for search terms and selected item display names
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [rikshawSearchTerm, setRikshawSearchTerm] = useState('');
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  const [selectedRikshawDisplayName, setSelectedRikshawDisplayName] = useState('');


  // Effect to update total_advance_collected based on the first advance payment
  useEffect(() => {
    // total_advance_collected is only the first advance payment
    const firstAdvanceAmount = advancePayments.length > 0 ? advancePayments[0].amount : 0;
    setSaleData(prev => ({ ...prev, total_advance_collected: firstAdvanceAmount }));
  }, [advancePayments]);

  // Fetch customers data using react-query with search filter
  const { data: customers = [], isLoading: loadingCustomers } = useQuery<Customer[]>({
    queryKey: ['customers', customerSearchTerm], // Include search term in query key
    queryFn: async () => {
      let query = supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (customerSearchTerm) {
        query = query.or(`name.ilike.%${customerSearchTerm}%,cnic.ilike.%${customerSearchTerm}%,phone.ilike.%${customerSearchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
  });

  // Fetch available rikshaws data using react-query with search filter
const { data: rikshaws = [], isLoading: loadingRikshaws } = useQuery<Rikshaw[]>({
  queryKey: ['available-rikshaws', rikshawSearchTerm], // Include search term in query key
  queryFn: async () => {
    let query = supabase
      .from('rikshaws')
      .select('*')
      .eq('availability', 'unsold')
      .order('created_at', { ascending: false });

    if (rikshawSearchTerm) {
      query = query.or(`manufacturer.ilike.%${rikshawSearchTerm}%,model_name.ilike.%${rikshawSearchTerm}%,engine_number.ilike.%${rikshawSearchTerm}%,chassis_number.ilike.%${rikshawSearchTerm}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }
});


  // Find the selected customer from the fetched data
  const selectedCustomer = customers.find(c => c.id === saleData.customer_id);
  
  // Find the selected rickshaw from the fetched data
  const selectedRikshaw = rikshaws.find(r => r.id === saleData.rikshaw_id);

  // Handler for changing individual advance payment details (amount or date)
  const handleAdvancePaymentChange = (index: number, field: keyof AdvancePayment, value: any) => {
    const newPayments = [...advancePayments];
    newPayments[index] = { ...newPayments[index], [field]: value };
    setAdvancePayments(newPayments);
  };

  // Handler for adding a new advance payment field
  const addAdvancePayment = () => {
    if (advancePayments.length < 4) { // Limit to a maximum of 4 advance payments
      setAdvancePayments([
        ...advancePayments,
        { amount: 0, date: new Date().toISOString().split('T')[0] } // Initialize with current date
      ]);
    }
  };

  // Handler for removing an advance payment field
  const removeAdvancePayment = (index: number) => {
    if (advancePayments.length > 1) { // Ensure at least one advance payment field remains
      const newPayments = [...advancePayments];
      newPayments.splice(index, 1);
      setAdvancePayments(newPayments);
    }
  };

  // Mutation to create a new sale record in Supabase
  const createSaleMutation = useMutation({
    mutationFn: async () => {
      setIsSubmitting(true); // Set submitting state to true

      // Basic validation for selected customer and rickshaw
      if (!selectedCustomer || !selectedRikshaw) {
        throw new Error("Invalid customer or rickshaw selection");
      }

      // Insert the new installment plan into the 'installment_plans' table
      const { data: plan, error: planError } = await supabase
        .from('installment_plans')
        .insert([{
          customer_id: saleData.customer_id,
          rikshaw_id: saleData.rikshaw_id,
          total_price: saleData.total_price,
          advance_paid: saleData.total_advance_collected, // Store total_advance_collected as advance_paid in DB
          advance_payments: advancePayments, // Store individual advance payments
          monthly_installment: saleData.monthly_installment,
          duration_months: saleData.duration_months,
          agreement_date: saleData.agreement_date, // Store agreement date
          showroom_commission: saleData.showroom_commission, // STORE COMMISSION
          is_commission_paid: isCommissionPaid, // STORE NEW COMMISSION PAID STATUS
          // Use the guarantor's details from the customer object
          guarantor_name: selectedCustomer.guarantor_name,
          guarantor_cnic: selectedCustomer.guarantor_cnic, 
          guarantor_phone: selectedCustomer.guarantor_phone,
          guarantor_address: selectedCustomer.guarantor_address,
          bank_name: selectedCustomer.bank_name,
          cheque_number: selectedCustomer.cheque_number,
          rikshaw_details: { // Store rickshaw details for historical record
            manufacturer: selectedRikshaw.manufacturer,
            model_name: selectedRikshaw.model_name,
            engine_number: selectedRikshaw.engine_number,
            chassis_number: selectedRikshaw.chassis_number,
            registration_number: selectedRikshaw.registration_number,
            type: selectedRikshaw.type
          }
        }])
        .select() // Select the newly inserted row
        .single(); // Expect a single row back

      if (planError) throw planError; // Handle insertion error

      // Update the availability of the sold rickshaw to 'sold' AND set the sale_price
      const { error: rikshawError } = await supabase
        .from('rikshaws')
        .update({
          availability: 'sold',
          sale_price: saleData.total_price // Set sale_price from total_price of the installment plan
        })
        .eq('id', saleData.rikshaw_id); // Match by rickshaw ID
      if (rikshawError) throw rikshawError; // Handle update error

      // Return details for the success state and receipt generation
      return {
        plan,
        customer: selectedCustomer,
        rikshaw: selectedRikshaw,
        advancePayments // Include individual advance payments in sale details
      };
    },
    onSuccess: (saleDetails) => {
      // Invalidate queries to refetch updated data
      queryClient.invalidateQueries({ queryKey: ['installment-plans'] });
      queryClient.invalidateQueries({ queryKey: ['available-rikshaws'] });
      queryClient.invalidateQueries({ queryKey: ['rikshaws'] }); // Invalidate general rikshaws query to update sale_price in table view
      setCreatedSaleDetails(saleDetails); // Store sale details
      toast({
        title: "Sale Completed!",
        description: "Rickshaw sold successfully!"
      });
    },
    onError: (error: any) => {
      // Display error toast
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    },
    onSettled: () => setIsSubmitting(false) // Reset submitting state regardless of success or error
  });

  // Function to reset the form to its initial state
  const resetForm = () => {
    setSaleData({
      customer_id: '',
      rikshaw_id: '',
      total_price: 0,
      total_advance_collected: 0, 
      monthly_installment: 0,
      duration_months: 12,
      agreement_date: new Date().toISOString().split('T')[0],
      showroom_commission: 0,
    });
    setIsCommissionPaid(false); // RESET NEW FIELD
    setAdvancePayments([
      { amount: 0, date: new Date().toISOString().split('T')[0] }
    ]);
    setShowPreview(false); // Hide the preview
    setCustomerSearchTerm(''); // Clear search terms
    setRikshawSearchTerm(''); // Clear search terms
    setSelectedCustomerName(''); // Clear selected customer name
    setSelectedRikshawDisplayName(''); // Clear selected rikshaw display name
  };

  // Handler for initiating the sale process
  const handleSellRickshaw = () => {
    // Validation checks
    if (!saleData.customer_id || !saleData.rikshaw_id) {
      toast({ title: "Error", description: "Please select a customer and rickshaw", variant: "destructive" });
      return;
    }

    if (saleData.total_price <= 0) {
      toast({ title: "Error", description: "Total price must be greater than 0", variant: "destructive" });
      return;
    }

    if (advancePayments[0].amount <= 0 || !advancePayments[0].date) {
      toast({ title: "Error", description: "The first advance payment (Total Advance Collected) must have a positive amount and valid date.", variant: "destructive" });
      return;
    }

    if (saleData.total_advance_collected > saleData.total_price) {
      toast({ title: "Error", description: "Total Advance Collected cannot exceed total price", variant: "destructive" });
      return;
    }
    
    // COMMISSION VALIDATION: must be 0 or greater
    if (saleData.showroom_commission < 0) {
        toast({ title: "Error", description: "Showroom Commission cannot be negative.", variant: "destructive" });
        return;
    }

    // Validate subsequent advance payments (installments)
    for (let i = 1; i < advancePayments.length; i++) {
      if (advancePayments[i].amount <= 0 || !advancePayments[i].date) {
        toast({ title: "Error", description: `Advance installment ${i + 1} must have a positive amount and valid date.`, variant: "destructive" });
        return;
      }
    }


    createSaleMutation.mutate(); // Trigger the sale creation mutation
  };

  // Function to start a new sale after a successful completion
  const startNewSale = () => {
    setCreatedSaleDetails(null); // Clear previous sale details
    resetForm(); // Reset the form
  };

  // Calculate remaining balance
  const remainingBalance = saleData.total_price - saleData.total_advance_collected;

  // Handle customer selection from search suggestions
  const handleSelectCustomer = (customer: Customer) => {
    setSaleData(prev => ({ ...prev, customer_id: customer.id }));
    setSelectedCustomerName(`${customer.name} (${customer.cnic})`);
    setCustomerSearchTerm(''); // Clear search term to hide suggestions
  };

  // Handle rikshaw selection from search suggestions
  const handleSelectRikshaw = (rikshaw: Rikshaw) => {
    setSaleData(prev => ({ ...prev, rikshaw_id: rikshaw.id }));
    setSelectedRikshawDisplayName(`${rikshaw.manufacturer} - ${rikshaw.model_name} (ENG: ${rikshaw.engine_number})`);
    setRikshawSearchTerm(''); // Clear search term to hide suggestions
  };


  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-8">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold text-gray-900 border-b pb-2">Sell Rickshaw</h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Complete rickshaw sales with installment plans and commission tracking.
        </p>
      </div>

      {createdSaleDetails ? ( // Display success message and receipt options if sale is completed
        <Card className="border-green-500 rounded-xl shadow-2xl">
          <CardHeader className="bg-green-50 border-b-4 border-green-500 p-6 rounded-t-xl">
            <CardTitle className="flex items-center gap-3 text-green-800 text-2xl font-bold">
              <Check className="h-7 w-7 text-green-600 animate-pulse" />
              Sale Completed Successfully!
            </CardTitle>
            <CardDescription className="text-green-700 mt-1">
              The rickshaw has been sold and an installment plan created.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {/* Customer Details */}
              <div className="border border-gray-200 p-4 rounded-lg bg-white shadow-md transition duration-300 hover:shadow-lg">
                <h3 className="text-lg font-semibold mb-3 text-gray-800 flex items-center gap-2"><Car className="h-5 w-5 text-blue-500" /> Customer Details</h3>
                <div className="space-y-2 text-sm text-gray-700">
                  <p><strong>Name:</strong> {createdSaleDetails.customer?.name}</p>
                  <p><strong>Address:</strong> {createdSaleDetails.customer?.address}</p>
                  <p><strong>CNIC:</strong> {createdSaleDetails.customer?.cnic}</p>
                  <p><strong>Phone:</strong> {createdSaleDetails.customer?.phone}</p>
                </div>
              </div>
              
              {/* Rickshaw Details */}
              <div className="border border-gray-200 p-4 rounded-lg bg-white shadow-md transition duration-300 hover:shadow-lg">
                <h3 className="text-lg font-semibold mb-3 text-gray-800 flex items-center gap-2"><Car className="h-5 w-5 text-blue-500" /> Rickshaw Details</h3>
                <div className="space-y-2 text-sm text-gray-700">
                  <p><strong>Manufacturer:</strong> {createdSaleDetails.rikshaw?.manufacturer}</p>
                  <p><strong>Model Name:</strong> {createdSaleDetails.rikshaw?.model_name}</p>
                  <p><strong>Engine No:</strong> {createdSaleDetails.rikshaw?.engine_number}</p>
                  <p><strong>Chassis No:</strong> {createdSaleDetails.rikshaw?.chassis_number}</p>
                  <p><strong>Registration No:</strong> {createdSaleDetails.rikshaw?.registration_number || 'N/A'}</p>
                  <p><strong>Type:</strong> {createdSaleDetails.rikshaw?.type}</p>
                </div>
              </div>
              
              {/* Payment Summary */}
              <div className="border border-gray-200 p-4 rounded-lg bg-white shadow-md transition duration-300 hover:shadow-lg">
                <h3 className="text-lg font-semibold mb-3 text-gray-800 flex items-center gap-2"><DollarSignIcon className="h-5 w-5 text-green-500" /> Payment Summary</h3>
                <div className="space-y-2 text-sm text-gray-700">
                  <p><strong>Total Price:</strong> <span className="font-bold text-gray-900">Rs {createdSaleDetails.plan?.total_price?.toLocaleString()}</span></p>
                  <p><strong>Total Advance:</strong> <span className="font-bold text-blue-600">Rs {createdSaleDetails.plan?.advance_paid?.toLocaleString()}</span></p>
                  <p><strong>Monthly Installment:</strong> <span className="font-bold text-gray-900">Rs {createdSaleDetails.plan?.monthly_installment?.toLocaleString()}</span></p>
                  <p><strong>Duration:</strong> {createdSaleDetails.plan?.duration_months} months</p>
                  <p><strong>Commission:</strong> Rs {createdSaleDetails.plan?.showroom_commission?.toLocaleString()}</p>
                  <p>
                    <strong>Commission Paid:</strong> 
                    <span className={cn("font-bold ml-1", createdSaleDetails.plan?.is_commission_paid ? "text-green-600" : "text-red-600")}>
                      {createdSaleDetails.plan?.is_commission_paid ? 'Yes' : 'No'}
                    </span>
                  </p>
                  <p><strong>Agreement Date:</strong> {format(new Date(createdSaleDetails.plan?.agreement_date), 'PPP')}</p>
                </div>
              </div>
            </div>
            
            <div className="border border-green-200 p-4 rounded-lg bg-green-50 mb-6 shadow-md">
              <h3 className="text-lg font-semibold mb-3 text-green-700 flex items-center gap-2"><DollarSignIcon className="h-5 w-5" /> Advance Due Schedule</h3>
              <Table className="bg-white rounded-lg overflow-hidden">
                <TableHeader className="bg-green-100">
                  <TableRow>
                    <TableHead className="text-green-800">#</TableHead>
                    <TableHead className="text-green-800">Amount</TableHead>
                    <TableHead className="text-green-800">Date</TableHead>
                    <TableHead className="text-green-800">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {createdSaleDetails.advancePayments?.map((payment: any, index: number) => (
                    <TableRow key={index} className="hover:bg-green-50 transition duration-150">
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>Rs {payment.amount.toLocaleString()}</TableCell>
                      <TableCell>{new Date(payment.date).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {index === 0 ? (
                          <span className="inline-flex items-center rounded-full bg-green-200 px-3 py-1 text-xs font-medium text-green-900">
                            <Check className="h-3 w-3 mr-1" /> Collected
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-800">
                            Pending Due
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                variant="default"
                onClick={startNewSale}
                className="px-8 py-3 bg-blue-600 text-white hover:bg-blue-700 rounded-lg shadow-lg font-semibold transition duration-300"
              >
                Start New Sale
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : showPreview ? ( // Display preview of sale details
        <Card className="rounded-xl shadow-2xl">
          <CardHeader className="bg-blue-100 border-b-4 border-blue-500 p-6 rounded-t-xl">
            <CardTitle className="flex items-center gap-3 text-blue-800 text-2xl font-bold">
              Preview Sale Details
            </CardTitle>
            <CardDescription className="text-blue-700 mt-1">Review the information before finalizing the sale</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="border border-gray-200 p-4 rounded-lg bg-white shadow-sm">
                <h3 className="text-lg font-semibold mb-3 text-blue-700">Customer Details</h3>
                <div className="space-y-2 text-sm text-gray-700">
                  <p><strong>Name:</strong> {selectedCustomer?.name}</p>
                  <p><strong>Address:</strong> {selectedCustomer?.address}</p>
                  <p><strong>CNIC:</strong> {selectedCustomer?.cnic}</p>
                  <p><strong>Phone:</strong> {selectedCustomer?.phone}</p>
                </div>
              </div>
              
              <div className="border border-gray-200 p-4 rounded-lg bg-white shadow-sm">
                <h3 className="text-lg font-semibold mb-3 text-blue-700">Rickshaw Details</h3>
                <div className="space-y-2 text-sm text-gray-700">
                  <p><strong>Manufacturer:</strong> {selectedRikshaw?.manufacturer}</p>
                  <p><strong>Model Name:</strong> {selectedRikshaw?.model_name}</p>
                  <p><strong>Engine No:</strong> {selectedRikshaw?.engine_number}</p>
                  <p><strong>Chassis No:</strong> {selectedRikshaw?.chassis_number}</p>
                  <p><strong>Registration No:</strong> {selectedRikshaw?.registration_number || 'N/A'}</p>
                  <p><strong>Type:</strong> {selectedRikshaw?.type}</p>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="border border-gray-200 p-4 rounded-lg bg-white shadow-sm">
                <h3 className="text-lg font-semibold mb-3 text-blue-700">Guarantor & Bank Details</h3>
                <div className="space-y-2 text-sm text-gray-700">
                  <p><strong>Guarantor Name:</strong> {selectedCustomer?.guarantor_name}</p>
                  <p><strong>Guarantor CNIC:</strong> {selectedCustomer?.guarantor_cnic}</p>
                  <p><strong>Bank Name:</strong> {selectedCustomer?.bank_name}</p>
                  <p><strong>Cheque Number:</strong> {selectedCustomer?.cheque_number}</p>
                </div>
              </div>
              
              <div className="border border-gray-200 p-4 rounded-lg bg-white shadow-sm">
                <h3 className="text-lg font-semibold mb-3 text-blue-700">Commission Status</h3>
                <div className="space-y-2 text-sm text-gray-700">
                    <p><strong>Showroom Commission:</strong> <span className="text-base font-semibold">Rs {saleData.showroom_commission.toLocaleString()}</span></p>
                    <p>
                        <strong>Commission Paid:</strong> 
                        <span className={cn("text-base font-bold ml-1", isCommissionPaid ? "text-green-600" : "text-red-600")}>
                            {isCommissionPaid ? "Yes (Paid)" : "No (Pending)"}
                        </span>
                    </p>
                    <p>This status will be saved with the agreement.</p>
                </div>
              </div>
            </div>
            
            <div className="border border-blue-200 p-4 rounded-lg bg-blue-50 mb-6 shadow-md">
              <h3 className="text-lg font-semibold mb-3 text-blue-700">Payment Details</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-gray-700"><strong>Total Price:</strong></p>
                  <p className="text-xl font-bold text-gray-900">Rs {saleData.total_price.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-gray-700"><strong>Total Advance:</strong></p>
                  <p className="text-xl font-bold text-gray-900">Rs {saleData.total_advance_collected.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-gray-700"><strong>Monthly Installment:</strong></p>
                  <p className="text-xl font-bold text-gray-900">Rs {saleData.monthly_installment.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-gray-700"><strong>Remaining Balance:</strong></p>
                  <p className="text-xl font-bold text-green-600">
                    Rs {remainingBalance.toLocaleString()}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-gray-700"><strong>Duration:</strong></p>
                  <p className="text-xl font-bold text-gray-900">{saleData.duration_months} months</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-gray-700"><strong>Agreement Date:</strong></p>
                  <p className="text-xl font-bold text-gray-900">{format(new Date(saleData.agreement_date), 'PPP')}</p>
                </div>
              </div>
            </div>
            
            <div className="border border-blue-200 p-4 rounded-lg bg-blue-50 mb-6 shadow-md">
              <h3 className="text-lg font-semibold mb-3 text-blue-700">Advance Due Schedule</h3>
              <Table className="bg-white rounded-lg overflow-hidden">
                <TableHeader className="bg-blue-100">
                  <TableRow>
                    <TableHead className="text-blue-800">#</TableHead>
                    <TableHead className="text-blue-800">Amount</TableHead>
                    <TableHead className="text-blue-800">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {advancePayments.map((payment, index) => (
                    <TableRow key={index} className="hover:bg-blue-50 transition duration-150">
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>Rs {payment.amount.toLocaleString()}</TableCell>
                      <TableCell>{new Date(payment.date).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 justify-end pt-4">
              <Button 
                variant="outline"
                onClick={() => setShowPreview(false)}
                className="px-8 py-2 text-gray-700 border-gray-300 hover:bg-gray-100 rounded-lg shadow-sm font-semibold"
              >
                Back to Edit
              </Button>
              <Button 
                onClick={handleSellRickshaw}
                disabled={isSubmitting}
                className="px-8 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-lg font-semibold"
              >
                {isSubmitting ? "Processing Sale..." : "Confirm & Complete Sale"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : ( // Display the main sale form
        <Card className="rounded-xl shadow-2xl">
          <CardHeader className="p-6">
            <CardTitle className="flex items-center gap-3 text-gray-900 text-2xl font-bold">
              <Car className="h-6 w-6 text-blue-600" />
              Rickshaw Sale Information
            </CardTitle>
            <CardDescription className="text-gray-600 mt-1">Fill in the details to complete the sale transaction</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8 p-6">
            {/* Customer Selection */}
            <div className="space-y-3">
              <Label htmlFor="customer-search" className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Search className="h-4 w-4" /> Select Customer *
              </Label>
              <div className="relative">
                <Input
                  id="customer-search"
                  placeholder="Search customer by name, CNIC, or phone..."
                  value={selectedCustomerName || customerSearchTerm} 
                  onChange={(e) => {
                    setCustomerSearchTerm(e.target.value);
                    setSelectedCustomerName(''); 
                    setSaleData(prev => ({ ...prev, customer_id: '' })); 
                  }}
                  className="pl-4 pr-4 py-2 rounded-lg border-2 border-gray-300 focus:border-blue-500 transition duration-150"
                />
                {customerSearchTerm && customers.length > 0 && (
                  <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto mt-1">
                    {customers.map(customer => (
                      <div
                        key={customer.id}
                        className="p-3 cursor-pointer hover:bg-blue-50 transition duration-150 border-b last:border-b-0"
                        onClick={() => handleSelectCustomer(customer)}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900">{customer.name} ({customer.cnic})</span>
                          <span className="text-xs text-gray-500">
                            Phone: {customer.phone} | Address: {customer.address}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Simplified loading/no results feedback */}
                {customerSearchTerm && !loadingCustomers && customers.length === 0 && (
                  <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-xl mt-1 p-3 text-red-500 font-medium">
                    No matching customers found.
                  </div>
                )}
              </div>
            </div>

            {/* Rickshaw Selection */}
            <div className="space-y-3">
              <Label htmlFor="rikshaw-search" className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Car className="h-4 w-4" /> Select Rickshaw *
              </Label>
              <div className="relative">
                <Input
                  id="rikshaw-search"
                  placeholder="Search rickshaw by manufacturer, engine, chassis, or reg. no..."
                  value={selectedRikshawDisplayName || rikshawSearchTerm} 
                  onChange={(e) => {
                    setRikshawSearchTerm(e.target.value);
                    setSelectedRikshawDisplayName(''); 
                    setSaleData(prev => ({ ...prev, rikshaw_id: '' })); 
                  }}
                  className="pl-4 pr-4 py-2 rounded-lg border-2 border-gray-300 focus:border-blue-500 transition duration-150"
                />
                {rikshawSearchTerm && rikshaws.length > 0 && (
                  <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto mt-1">
                    {rikshaws.map(rikshaw => (
                      <div
                        key={rikshaw.id}
                        className="p-3 cursor-pointer hover:bg-blue-50 transition duration-150 border-b last:border-b-0"
                        onClick={() => handleSelectRikshaw(rikshaw)}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900">{rikshaw.manufacturer} - {rikshaw.model_name} ({rikshaw.type})</span>
                          <span className="text-xs text-gray-500">
                            ENG: {rikshaw.engine_number} | CHS: {rikshaw.chassis_number} | REG: {rikshaw.registration_number || 'N/A'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Simplified loading/no results feedback */}
                {rikshawSearchTerm && !loadingRikshaws && rikshaws.length === 0 && (
                  <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-xl mt-1 p-3 text-red-500 font-medium">
                    No unsold rickshaws found matching your search.
                  </div>
                )}
              </div>
            </div>

            {/* Selected Details Display (Conditional) */}
            {(saleData.customer_id || saleData.rikshaw_id) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 border border-blue-200 rounded-xl bg-blue-50 shadow-inner">
                {saleData.customer_id && selectedCustomer && (
                  <div className="space-y-1 text-sm text-gray-700">
                    <h4 className="font-bold text-blue-800 mb-2">Customer Selected:</h4>
                    <p><span className="font-semibold">Name:</span> {selectedCustomer.name}</p>
                    <p><span className="font-semibold">CNIC:</span> {selectedCustomer.cnic}</p>
                    <p><span className="font-semibold">Guarantor:</span> {selectedCustomer.guarantor_name || 'N/A'}</p>
                  </div>
                )}
                {saleData.rikshaw_id && selectedRikshaw && (
                  <div className="space-y-1 text-sm text-gray-700">
                    <h4 className="font-bold text-blue-800 mb-2">Rickshaw Selected:</h4>
                    <p><span className="font-semibold">Model:</span> {selectedRikshaw.manufacturer} - {selectedRikshaw.model_name}</p>
                    <p><span className="font-semibold">Engine No:</span> {selectedRikshaw.engine_number}</p>
                    <p><span className="font-semibold">Chassis No:</span> {selectedRikshaw.chassis_number}</p>
                  </div>
                )}
              </div>
            )}

            {/* Price and Agreement Date */}
            <div className="space-y-4 pt-4 border-t border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Sale Terms</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="total-price" className="text-gray-700">Total Price (Rs) *</Label>
                  <Input
                    id="total-price"
                    type="number"
                    value={saleData.total_price || ''}
                    onChange={(e) => setSaleData({
                      ...saleData, 
                      total_price: parseFloat(e.target.value) || 0
                    })}
                    required
                    className="rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <Label htmlFor="agreement-date" className="text-gray-700">Agreement Date *</Label>
                  <Input
                    id="agreement-date"
                    type="date"
                    value={saleData.agreement_date}
                    onChange={(e) => setSaleData({
                      ...saleData,
                      agreement_date: e.target.value
                    })}
                    required
                    className="rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Commission and Status */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="showroom-commission" className="text-gray-700">Showroom Commission (Rs)</Label>
                  <Input
                    id="showroom-commission"
                    type="number"
                    value={saleData.showroom_commission || ''}
                    onChange={(e) => setSaleData({
                      ...saleData, 
                      showroom_commission: parseFloat(e.target.value) || 0
                    })}
                    className="rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                
                {/* Commission Paid Checkbox/Toggle */}
                <div className="flex flex-col justify-end pt-2">
                  <Label className="text-gray-700 mb-2">Commission Paid Status</Label>
                  <Button 
                    variant="outline"
                    onClick={() => setIsCommissionPaid(prev => !prev)}
                    className={cn(
                      "w-full h-10 rounded-lg font-semibold transition-all duration-300",
                      isCommissionPaid ? "bg-green-100 border-green-500 text-green-700 hover:bg-green-200" : "bg-red-100 border-red-500 text-red-700 hover:bg-red-200"
                    )}
                  >
                    {isCommissionPaid ? (
                        <><Check className="h-4 w-4 mr-2" /> Commission Paid</>
                    ) : (
                        <><DollarSignIcon className="h-4 w-4 mr-2" /> Commission Pending</>
                    )}
                  </Button>
                </div>
              </div>


            </div>
            
            {/* Advance Payments Section */}
            <div className="space-y-4 pt-4 border-t border-gray-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">Advance Due Schedule</h3>
                {advancePayments.length < 4 && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={addAdvancePayment}
                    className="px-4 py-2 text-blue-600 border-blue-600 hover:bg-blue-50 rounded-lg shadow-sm flex items-center gap-1 transition duration-150"
                  >
                    <Plus className="h-4 w-4" /> Add Advance
                  </Button>
                )}
              </div>
              
              <div className="space-y-4">
                {advancePayments.map((payment, index) => (
                  <div key={index} className="flex flex-col sm:flex-row gap-4 items-end bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <div className="flex-1 w-full">
                      <Label className="text-gray-700">Amount (Rs) {index === 0 ? ' (Collected)*' : ''}</Label>
                      <Input
                        type="number"
                        value={payment.amount || ''}
                        onChange={(e) => handleAdvancePaymentChange(
                          index, 
                          'amount', 
                          parseFloat(e.target.value) || 0
                        )}
                        required={index === 0}
                        className="rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                        placeholder={index === 0 ? "Initial Advance Collected" : `Advance Installment ${index + 1}`}
                      />
                    </div>
                    <div className="flex-1 w-full">
                      <Label className="text-gray-700">Due Date {index === 0 ? '*' : ''}</Label>
                      <Input
                        type="date"
                        value={payment.date}
                        onChange={(e) => handleAdvancePaymentChange(
                          index, 
                          'date', 
                          e.target.value
                        )}
                        required={index === 0}
                        className="rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                    {advancePayments.length > 1 && (
                      <Button 
                        variant="destructive" 
                        size="icon"
                        onClick={() => removeAdvancePayment(index)}
                        className="mb-0 sm:mb-0 rounded-lg shadow-md flex-shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            
            {/* Installment and Summary */}
            <div className="space-y-4 pt-4 border-t border-gray-200">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Installment Plan</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <Label htmlFor="monthly-installment" className="text-gray-700">Monthly Installment (Rs)</Label>
                        <Input
                            id="monthly-installment"
                            type="number"
                            value={saleData.monthly_installment || ''}
                            onChange={(e) => setSaleData({
                                ...saleData, 
                                monthly_installment: parseFloat(e.target.value) || 0
                            })}
                            className="rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <Label htmlFor="duration-months" className="text-gray-700">Duration (Months) *</Label>
                        <Input
                            id="duration-months"
                            type="number"
                            value={saleData.duration_months || ''}
                            onChange={(e) => setSaleData({
                                ...saleData, 
                                duration_months: parseInt(e.target.value) || 0
                            })}
                            required
                            className="rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                        />
                    </div>
                </div>
            </div>
            
            {/* Summary Totals */}
            <div className="pt-4 grid grid-cols-2 gap-4 border-t border-gray-200 bg-gray-50 p-4 rounded-xl shadow-inner">
              <div className="border-r border-gray-300 pr-4">
                <Label className="text-lg font-bold text-blue-800">Total Advance Collected (Rs)</Label>
                <div className="text-2xl font-extrabold text-blue-600 mt-1">
                  Rs {saleData.total_advance_collected.toLocaleString()}
                </div>
              </div>
              <div className="pl-4">
                <Label className="text-lg font-bold text-green-800">Remaining Balance (Rs)</Label>
                <div className="text-2xl font-extrabold text-green-600 mt-1">
                  Rs {remainingBalance.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end pt-6">
              <Button 
                size="lg" 
                onClick={() => setShowPreview(true)}
                disabled={!saleData.customer_id || !saleData.rikshaw_id || saleData.total_price <= 0 || advancePayments[0].amount <= 0 || !advancePayments[0].date || advancePayments.some((p, i) => i > 0 && (p.amount <= 0 || !p.date)) || saleData.duration_months <= 0}
                className="px-10 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xl font-bold transition duration-300 transform hover:scale-[1.01]"
              >
                Preview Sale Details
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SellRickshaw;
