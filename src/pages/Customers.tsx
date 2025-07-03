import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, Search, Eye, XCircle, Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';

// Define the Customer interface
interface Customer {
  id: string;
  name: string;
  cnic: string;
  phone: string;
  address: string;
  assigned_rickshaw: string | null;
  guarantor_name: string | null;
  guarantor_cnic: string | null;
  guarantor_phone: string | null;
  guarantor_address: string | null;
  bank_name: string | null;
  cheque_number: string | null;
  created_at: string; // This is the customer record creation date
  updated_at: string;
  agreement_date: string | null; // Field to store the latest agreement date from installment_plans
}

// Define the CustomerFormData interface for form input
interface CustomerFormData {
  name: string;
  cnic: string;
  phone: string;
  address: string;
  guarantor_name: string | null;
  guarantor_cnic: string | null;
  guarantor_phone: string | null;
  guarantor_address: string | null;
  bank_name: string | null;
  cheque_number: string | null;
}

// Helper function to remove hyphens from phone numbers and ensure it's a string
const cleanPhoneNumber = (number: string | null | undefined): string => {
  return number ? number.replace(/-/g, '') : '';
};

// Error Boundary Component (kept as provided, good practice)
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
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
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

// Props interface for CustomerForm
interface CustomerFormProps {
  formData: CustomerFormData;
  setFormData: React.Dispatch<React.SetStateAction<CustomerFormData>>;
  formErrors: Record<string, string>;
  editingCustomer: Customer | null;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  onCancel: () => void;
}

// Separate CustomerForm component (memoized for performance)
const CustomerForm: React.FC<CustomerFormProps> = React.memo(({
  formData,
  setFormData,
  formErrors,
  editingCustomer,
  onSubmit,
  isLoading,
  onCancel
}) => {
  // Helper to update specific field in formData
  const handleInputChange = useCallback((field: keyof CustomerFormData, value: string | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, [setFormData]);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          {formErrors.guarantor && (
            <div className="p-3 bg-red-50 text-red-700 rounded-md">
              {formErrors.guarantor}
            </div>
          )}

          <h3 className="text-lg font-semibold border-b pb-2">Customer Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                value={formData.name || ''}
                onChange={(e) => handleInputChange('name', e.target.value)}
                required
              />
              {formErrors.name && <p className="text-red-500 text-sm">{formErrors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnic">CNIC *</Label>
              <Input
                id="cnic"
                value={formData.cnic || ''}
                onChange={(e) => handleInputChange('cnic', e.target.value)}
                placeholder="12345-1234567-1"
                required
              />
              {formErrors.cnic && <p className="text-red-500 text-sm">{formErrors.cnic}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number *</Label>
            <Input
              id="phone"
              value={formData.phone || ''}
              onChange={(e) => handleInputChange('phone', cleanPhoneNumber(e.target.value))} // Clean here
              placeholder="e.g., 03001234567"
              required
            />
            {formErrors.phone && <p className="text-red-500 text-sm">{formErrors.phone}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address *</Label>
            <Textarea
              id="address"
              value={formData.address || ''}
              onChange={(e) => handleInputChange('address', e.target.value)}
              rows={3}
              required
            />
            {formErrors.address && <p className="text-red-500 text-sm">{formErrors.address}</p>}
          </div>

          <h3 className="text-lg font-semibold border-b pb-2 mt-6">Guarantor Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="guarantor_name">Guarantor Name</Label>
              <Input
                id="guarantor_name"
                value={formData.guarantor_name || ''}
                onChange={(e) => handleInputChange('guarantor_name', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guarantor_cnic">Guarantor CNIC</Label>
              <Input
                id="guarantor_cnic"
                value={formData.guarantor_cnic || ''}
                onChange={(e) => handleInputChange('guarantor_cnic', e.target.value)}
                placeholder="12345-1234567-1"
              />
              {formErrors.guarantor_cnic && <p className="text-red-500 text-sm">{formErrors.guarantor_cnic}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="guarantor_phone">Guarantor Phone Number</Label>
              <Input
                id="guarantor_phone"
                value={formData.guarantor_phone || ''}
                onChange={(e) => handleInputChange('guarantor_phone', cleanPhoneNumber(e.target.value))} // Clean here
                placeholder="e.g., 03001234567"
              />
              {formErrors.guarantor_phone && <p className="text-red-500 text-sm">{formErrors.guarantor_phone}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="guarantor_address">Guarantor Address</Label>
              <Textarea
                id="guarantor_address"
                value={formData.guarantor_address || ''}
                onChange={(e) => handleInputChange('guarantor_address', e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <h3 className="text-lg font-semibold border-b pb-2 mt-6">Bank Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bank_name">Bank Name</Label>
              <Input
                id="bank_name"
                value={formData.bank_name || ''}
                onChange={(e) => handleInputChange('bank_name', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cheque_number">Cheque Number</Label>
              <Input
                id="cheque_number"
                value={formData.cheque_number || ''}
                onChange={(e) => handleInputChange('cheque_number', e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end mt-6">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              aria-disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (editingCustomer ? 'Update Customer' : 'Add Customer')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
});

// Props interface for CustomerDetailsDisplay
interface CustomerDetailsDisplayProps {
  customer: Customer;
  onClose: () => void;
}

// Separate CustomerDetailsDisplay component (memoized for performance)
const CustomerDetailsDisplay: React.FC<CustomerDetailsDisplayProps> = React.memo(({ customer, onClose }) => (
  <Card className="mt-6">
    <CardHeader className="flex flex-row items-center justify-between">
      <CardTitle>Customer Details</CardTitle>
      <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close details">
        <XCircle className="h-5 w-5" />
      </Button>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div className="space-y-1">
          <p className="font-semibold">Full Name:</p>
          <p>{customer.name}</p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold">CNIC:</p>
          <p>{customer.cnic}</p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold">Phone Number:</p>
          <p>{customer.phone}</p> {/* Display without hyphens */}
        </div>
        <div className="space-y-1">
          <p className="font-semibold">Assigned Rickshaw:</p>
          <p>{customer.assigned_rickshaw || 'N/A'}</p>
        </div>
        <div className="space-y-1 col-span-2">
          <p className="font-semibold">Address:</p>
          <p>{customer.address}</p>
        </div>

        <div className="col-span-2">
          <h3 className="text-md font-semibold border-b pb-1 mt-4">Guarantor Details</h3>
        </div>
        <div className="space-y-1">
          <p className="font-semibold">Guarantor Name:</p>
          <p>{customer.guarantor_name || 'N/A'}</p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold">Guarantor CNIC:</p>
          <p>{customer.guarantor_cnic || 'N/A'}</p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold">Guarantor Phone:</p>
          <p>{customer.guarantor_phone || 'N/A'}</p> {/* Display without hyphens */}
        </div>
        <div className="space-y-1 col-span-2">
          <p className="font-semibold">Guarantor Address:</p>
          <p>{customer.guarantor_address || 'N/A'}</p>
        </div>

        <div className="col-span-2">
          <h3 className="text-md font-semibold border-b pb-1 mt-4">Bank Details</h3>
        </div>
        <div className="space-y-1">
          <p className="font-semibold">Bank Name:</p>
          <p>{customer.bank_name || 'N/A'}</p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold">Cheque Number:</p>
          <p>{customer.cheque_number || 'N/A'}</p>
        </div>

        <div className="space-y-1 col-span-2">
          <p className="font-semibold">Agreement Date:</p>
          {/* Display agreement_date from installment_plans */}
          <p>{customer.agreement_date ? new Date(customer.agreement_date).toLocaleDateString() : 'N/A'}</p>
        </div>
      </div>
    </CardContent>
  </Card>
));

// Main Customers Component
const Customers = () => {
  const ITEMS_PER_PAGE = 15;
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<CustomerFormData>({
    name: '',
    cnic: '',
    phone: '',
    address: '',
    guarantor_name: '',
    guarantor_cnic: '',
    guarantor_phone: '',
    guarantor_address: '',
    bank_name: '',
    cheque_number: ''
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // useCallback for fetchCustomers to ensure stable reference
  const fetchCustomers = useCallback(async ({ queryKey }: { queryKey: any[] }) => {
    const [_key, currentSearchTerm, currentPage, limit] = queryKey;
    const offset = currentPage * limit;

    // Fetch customers along with their related installment plans
    let query = supabase
      .from('customers')
      .select('*, installment_plans(agreement_date, created_at)', { count: 'exact' });

    if (currentSearchTerm) {
      // Use cleanPhoneNumber for search term when searching against phone numbers
      const cleanedSearchTerm = cleanPhoneNumber(currentSearchTerm);
      query = query.or(`name.ilike.%${currentSearchTerm}%,cnic.ilike.%${currentSearchTerm}%,phone.ilike.%${cleanedSearchTerm}%`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);

    // Process the fetched data to include the latest agreement_date for each customer
    const customersWithPlans = data as Array<Customer & { installment_plans: Array<{ agreement_date: string, created_at: string }> }>;
    const processedCustomers = customersWithPlans.map(customer => {
      // Find the latest installment plan based on its created_at timestamp
      const latestPlan = customer.installment_plans
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        [0]; // Get the first (latest) one after sorting

      return {
        ...customer,
        // Assign the agreement_date from the latest plan, or null if no plans
        agreement_date: latestPlan ? latestPlan.agreement_date : null
      };
    });

    return { data: processedCustomers, count: count as number };
  }, []);

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['customers', searchTerm, page, ITEMS_PER_PAGE],
    queryFn: fetchCustomers,
    placeholderData: (previousData) => previousData,
    staleTime: 5 * 60 * 1000, // 5 minutes
    keepPreviousData: true,
    retry: 1, // Retry once on failure
    refetchOnWindowFocus: false // Prevent refetching on window focus
  });

  const customers = data?.data || [];
  const totalCustomersCount = data?.count || 0;
  const hasMore = (page + 1) * ITEMS_PER_PAGE < totalCustomersCount;

  // Reset page to 0 when search term changes
  useEffect(() => {
    setPage(0);
  }, [searchTerm]);

  // Validation logic
  const validateForm = useCallback(async (): Promise<boolean> => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) errors.name = 'Name is required';
    if (!formData.cnic.trim()) errors.cnic = 'CNIC is required';
    if (!formData.phone.trim()) errors.phone = 'Phone is required';
    if (!formData.address.trim()) errors.address = 'Address is required';

    // CNIC format validation (xxxxx-xxxxxxx-x)
    if (formData.cnic && !/^\d{5}-\d{7}-\d{1}$/.test(formData.cnic)) {
      errors.cnic = 'CNIC must be in format: xxxxx-xxxxxxx-x';
    } else if (formData.cnic) {
      // Check CNIC uniqueness
      const { data: existingCustomer, error: cnicError } = await supabase
        .from('customers')
        .select('id')
        .eq('cnic', formData.cnic)
        .maybeSingle(); // Use maybeSingle for better handling of no results or multiple

      if (cnicError) console.error('Error checking CNIC uniqueness:', cnicError);

      // If an existing customer with this CNIC is found and it's not the current customer being edited
      if (existingCustomer && (editingCustomer ? existingCustomer.id !== editingCustomer.id : true)) {
        errors.cnic = 'This CNIC is already registered.';
      }
    }

    // Phone format validation (11 digits, starts with 03)
    if (formData.phone && !/^03\d{9}$/.test(formData.phone)) {
      errors.phone = 'Phone must be an 11-digit number starting with 03 (e.g., 03001234567)';
    } else if (formData.phone) {
      // Check Phone uniqueness
      const { data: existingCustomer, error: phoneError } = await supabase
        .from('customers')
        .select('id')
        .eq('phone', formData.phone)
        .maybeSingle();

      if (phoneError) console.error('Error checking phone uniqueness:', phoneError);

      if (existingCustomer && (editingCustomer ? existingCustomer.id !== editingCustomer.id : true)) {
        errors.phone = 'This Phone Number is already registered.';
      }
    }

    const guarantorFields = [
      formData.guarantor_name,
      formData.guarantor_cnic,
      formData.guarantor_phone,
      formData.guarantor_address
    ];

    const hasAnyGuarantorFieldFilled = guarantorFields.some(field => !!field?.trim());
    const areAllGuarantorFieldsFilled = guarantorFields.every(field => !field || field.trim()); // Changed to check if all non-empty are trimmed

    if (hasAnyGuarantorFieldFilled && !areAllGuarantorFieldsFilled) {
      errors.guarantor = 'All guarantor fields (Name, CNIC, Phone, Address) must be filled if any are provided.';
    }

    // Validate guarantor CNIC format if provided
    if (formData.guarantor_cnic && !/^\d{5}-\d{7}-\d{1}$/.test(formData.guarantor_cnic)) {
      errors.guarantor_cnic = 'Guarantor CNIC must be in format: xxxxx-xxxxxxx-x';
    }

    // Validate guarantor phone format if provided (11 digits, starts with 03)
    if (formData.guarantor_phone && !/^03\d{9}$/.test(formData.guarantor_phone)) {
      errors.guarantor_phone = 'Guarantor phone must be an 11-digit number starting with 03 (e.g., 03001234567)';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData, editingCustomer]);


  const addCustomerMutation = useMutation({
    mutationFn: async (customerData: CustomerFormData) => {
      // Validation is now handled inside the mutation fn
      const isValid = await validateForm();
      if (!isValid) {
        // Throw an error to trigger onError and display toast
        throw new Error('Please correct the highlighted fields.');
      }

      const { data, error } = await supabase
        .from('customers')
        .insert([customerData])
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setIsFormVisible(false);
      setSelectedCustomer(null);
      resetForm();
      toast({
        title: "Success",
        description: "Customer added successfully"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const updateCustomerMutation = useMutation({
    mutationFn: async ({ id, ...customerData }: CustomerFormData & { id: string }) => {
      const isValid = await validateForm();
      if (!isValid) {
        throw new Error('Please correct the highlighted fields.');
      }

      const { data, error } = await supabase
        .from('customers')
        .update(customerData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setIsFormVisible(false);
      setEditingCustomer(null);
      setSelectedCustomer(null);
      resetForm();
      toast({
        title: "Success",
        description: "Customer updated successfully"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setSelectedCustomer(null);
      toast({
        title: "Success",
        description: "Customer deleted successfully"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Resets the form data and errors
  const resetForm = useCallback(() => {
    setFormData({
      name: '',
      cnic: '',
      phone: '',
      address: '',
      guarantor_name: '',
      guarantor_cnic: '',
      guarantor_phone: '',
      guarantor_address: '',
      bank_name: '',
      cheque_number: ''
    });
    setFormErrors({});
  }, []);

  const handleAddClick = useCallback(() => {
    resetForm();
    setEditingCustomer(null);
    setSelectedCustomer(null);
    setIsFormVisible(true);
  }, [resetForm]);

  const handleFormCancel = useCallback(() => {
    setIsFormVisible(false);
    setEditingCustomer(null);
    resetForm();
  }, [resetForm]);

  // Form submission handler for adding customers
  const handleAddSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    // Validation is now run directly inside the mutation function
    addCustomerMutation.mutate(formData);
  }, [formData, addCustomerMutation]);

  // Handler for editing a customer
  const handleEdit = useCallback((customer: Customer) => {
    setSelectedCustomer(null); // Ensure details view is closed
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      cnic: customer.cnic,
      phone: customer.phone, // Phone number should already be without hyphens from DB
      address: customer.address,
      guarantor_name: customer.guarantor_name,
      guarantor_cnic: customer.guarantor_cnic,
      guarantor_phone: customer.guarantor_phone, // Phone number should already be without hyphens from DB
      guarantor_address: customer.guarantor_address,
      bank_name: customer.bank_name,
      cheque_number: customer.cheque_number,
    });
    setIsFormVisible(true);
    setFormErrors({}); // Clear any previous form errors
  }, []);

  // Form submission handler for updating customers
  const handleUpdateSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCustomer) {
      // Validation is now run directly inside the mutation function
      updateCustomerMutation.mutate({ ...formData, id: editingCustomer.id });
    }
  }, [editingCustomer, formData, updateCustomerMutation]);

  // Handler for deleting a customer
  const handleDelete = useCallback((id: string) => {
    if (window.confirm('Are you sure you want to delete this customer? This action cannot be undone.')) {
      deleteCustomerMutation.mutate(id);
    }
  }, [deleteCustomerMutation]);

  // Handler for viewing customer details
  const handleViewDetails = useCallback((customer: Customer) => {
    setIsFormVisible(false);
    setEditingCustomer(null);
    setSelectedCustomer(customer);
    setFormErrors({});
  }, []);

  // Handler for closing customer details view
  const handleCloseDetails = useCallback(() => {
    setSelectedCustomer(null);
    setIsFormVisible(false);
    setEditingCustomer(null);
    resetForm();
  }, [resetForm]);

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Customer Management</h1>
          {/* Show Add Customer button only when no form or details are visible */}
          {!isFormVisible && !selectedCustomer && (
            <Button onClick={handleAddClick} aria-label="Add customer">
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
          )}
        </div>

        {/* Conditionally render CustomerForm */}
        {isFormVisible && (
          <CustomerForm
            formData={formData}
            setFormData={setFormData}
            formErrors={formErrors}
            editingCustomer={editingCustomer}
            onSubmit={editingCustomer ? handleUpdateSubmit : handleAddSubmit}
            isLoading={addCustomerMutation.isPending || updateCustomerMutation.isPending}
            onCancel={handleFormCancel}
          />
        )}

        {/* Conditionally render CustomerDetailsDisplay */}
        {!isFormVisible && selectedCustomer && (
          <CustomerDetailsDisplay customer={selectedCustomer} onClose={handleCloseDetails} />
        )}
        
        {/* Main Customer List Card */}
        <Card>
          <CardHeader>
            <CardTitle>Customer List</CardTitle>
            <div className="flex items-center space-x-2 mt-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search customers by name, CNIC, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
                aria-label="Search customers"
              />
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Showing {customers.length} of {totalCustomersCount} customers.
            </p>
          </CardHeader>
          <CardContent>
            {isLoading && !customers.length ? (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                <p className="mt-2 text-muted-foreground">Loading customers...</p>
              </div>
            ) : isError ? (
              <div className="text-center py-8 text-red-500">
                Error loading customers: {error?.message}
                <Button
                  variant="outline"
                  className="mt-2"
                  onClick={() => queryClient.refetchQueries({ queryKey: ['customers'] })}
                >
                  Retry
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>CNIC</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Agreement Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.length === 0 && !isFetching ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {searchTerm ? 'No customers found matching your search.' : 'No customers added yet.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    customers.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell className="font-medium">{customer.name}</TableCell>
                        <TableCell>{customer.cnic}</TableCell>
                        <TableCell>{customer.phone}</TableCell>
                        <TableCell className="max-w-xs truncate">{customer.address}</TableCell>
                        <TableCell>{customer.agreement_date ? new Date(customer.agreement_date).toLocaleDateString() : 'N/A'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewDetails(customer)}
                              aria-label={`View details of ${customer.name}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(customer)}
                              aria-label={`Edit ${customer.name}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(customer.id)}
                              disabled={deleteCustomerMutation.isPending}
                              aria-label={`Delete ${customer.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                  {isFetching && customers.length > 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
                        <p className="text-muted-foreground text-sm mt-2">Loading more...</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}

            {/* Pagination controls */}
            {hasMore && (
              <div className="text-center mt-6">
                <Button onClick={() => setPage(prev => prev + 1)} disabled={isFetching}>
                  {isFetching ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading More...
                    </>
                  ) : (
                    'Show More'
                  )}
                </Button>
              </div>
            )}

            {!hasMore && customers.length > 0 && !isFetching && (
              <p className="text-center text-muted-foreground text-sm mt-6">
                You've reached the end of the list.
              </p>
            )}

          </CardContent>
        </Card>
      </div>
    </ErrorBoundary>
  );
};

export default Customers;