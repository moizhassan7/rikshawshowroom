import React, { useState, useCallback, useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Car, Plus, Search, Edit, Trash2, Eye, XCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { debounce } from 'lodash';

// Define the exact type as per the new Supabase table schema
interface Rikshaw {
  id: string;
  manufacturer: 'New Asia' | 'Salaar' | 'Rozgar' | 'TezRaftar' | string;
  model_name: string;
  type: 'Loader 100 CC' | 'Loader 150 CC' | 'Rikshaw 200 CC Family' | 'Rikshaw 200 CC Open 6-seater';
  engine_number: string;
  chassis_number: string;
  registration_number: string | null;
  category: 'new' | 'old';
  availability: 'sold' | 'unsold';
  created_at: string;
  updated_at: string;
  purchase_date: string; // ISO string 'YYYY-MM-DD'
  purchase_price: number;
  sale_price: number | null; // Can be null if not sold yet
}

// Define the form data structure for adding/editing
interface RikshawFormData {
  manufacturer: string;
  model_name: string;
  type: string;
  engine_number: string;
  chassis_number: string;
  registration_number: string;
  category: string;
  availability: string;
  purchase_date: string;
  purchase_price: number | null; // Changed to allow null for empty input
  sale_price: number | null;
}

// Error Boundary Component
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

// -------------------------------------------------------------------------
// RikshawForm Component
// -------------------------------------------------------------------------
interface RikshawFormProps {
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  onCancel: () => void;
  formData: RikshawFormData;
  setFormData: React.Dispatch<React.SetStateAction<RikshawFormData>>;
  editingRikshaw: Rikshaw | null;
  validationErrors: { [key: string]: string };
}

const RikshawForm = React.memo(({ onSubmit, isLoading, onCancel, formData, setFormData, editingRikshaw, validationErrors }: RikshawFormProps) => {
  const manufacturers = ['New Asia', 'Salaar', 'Rozgar', 'TezRaftar'];
  const types = ['Loader 100 CC', 'Loader 150 CC', 'Rikshaw 200 CC Family', 'Rikshaw 200 CC Open 6-seater'];
  const categories = ['new', 'old'];
  const availabilities = ['unsold', 'sold'];

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>{editingRikshaw ? 'Edit Rikshaw' : 'Add New Rikshaw'}</CardTitle>
        <CardDescription>
          {editingRikshaw ? 'Update the rikshaw details below.' : 'Fill in the details to add a new rikshaw to your inventory.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="manufacturer">Manufacturer/Maker *</Label>
              <Select
                value={formData.manufacturer}
                onValueChange={(value) => setFormData({ ...formData, manufacturer: value })}
                required
                aria-invalid={!!validationErrors.manufacturer}
                aria-describedby={validationErrors.manufacturer ? "manufacturer-error" : undefined}
              >
                <SelectTrigger className={validationErrors.manufacturer ? "border-destructive" : ""}>
                  <SelectValue placeholder="Select Manufacturer" />
                </SelectTrigger>
                <SelectContent>
                  {manufacturers.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {validationErrors.manufacturer && <p id="manufacturer-error" className="text-destructive text-sm mt-1">{validationErrors.manufacturer}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="model_name">Model *</Label>
              <Input
                id="model_name"
                value={formData.model_name}
                onChange={(e) => setFormData({ ...formData, model_name: e.target.value })}
                placeholder="e.g., SAF-150"
                required
                autoComplete="off"
                className={validationErrors.model_name ? "border-destructive" : ""}
                aria-invalid={!!validationErrors.model_name}
                aria-describedby={validationErrors.model_name ? "model-name-error" : undefined}
              />
              {validationErrors.model_name && <p id="model-name-error" className="text-destructive text-sm mt-1">{validationErrors.model_name}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Type *</Label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData({ ...formData, type: value })}
              required
              aria-invalid={!!validationErrors.type}
              aria-describedby={validationErrors.type ? "type-error" : undefined}
            >
              <SelectTrigger className={validationErrors.type ? "border-destructive" : ""}>
                <SelectValue placeholder="Select Rikshaw Type" />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {validationErrors.type && <p id="type-error" className="text-destructive text-sm mt-1">{validationErrors.type}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="engine_number">Engine Number *</Label>
              <Input
                id="engine_number"
                value={formData.engine_number}
                onChange={(e) => setFormData({ ...formData, engine_number: e.target.value })}
                placeholder="e.g., ENG123456"
                required
                autoComplete="off"
                className={validationErrors.engine_number ? "border-destructive" : ""}
                aria-invalid={!!validationErrors.engine_number}
                aria-describedby={validationErrors.engine_number ? "engine-number-error" : undefined}
              />
              {validationErrors.engine_number && <p id="engine-number-error" className="text-destructive text-sm mt-1">{validationErrors.engine_number}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="chassis_number">Chassis Number *</Label>
              <Input
                id="chassis_number"
                value={formData.chassis_number}
                onChange={(e) => setFormData({ ...formData, chassis_number: e.target.value })}
                placeholder="e.g., CHAS789012"
                required
                autoComplete="off"
                className={validationErrors.chassis_number ? "border-destructive" : ""}
                aria-invalid={!!validationErrors.chassis_number}
                aria-describedby={validationErrors.chassis_number ? "chassis-number-error" : undefined}
              />
              {validationErrors.chassis_number && <p id="chassis-number-error" className="text-destructive text-sm mt-1">{validationErrors.chassis_number}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="registration_number">Registration Number</Label>
            <Input
              id="registration_number"
              value={formData.registration_number}
              onChange={(e) => setFormData({ ...formData, registration_number: e.target.value })}
              placeholder="e.g., ABC-123"
              autoComplete="off"
              className={validationErrors.registration_number ? "border-destructive" : ""}
              aria-invalid={!!validationErrors.registration_number}
              aria-describedby={validationErrors.registration_number ? "registration-number-error" : undefined}
            />
            {validationErrors.registration_number && <p id="registration-number-error" className="text-destructive text-sm mt-1">{validationErrors.registration_number}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
                required
                aria-invalid={!!validationErrors.category}
                aria-describedby={validationErrors.category ? "category-error" : undefined}
              >
                <SelectTrigger className={validationErrors.category ? "border-destructive" : ""}>
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {validationErrors.category && <p id="category-error" className="text-destructive text-sm mt-1">{validationErrors.category}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="availability">Availability *</Label>
              <Select
                value={formData.availability}
                onValueChange={(value) => {
                  setFormData(prev => ({
                    ...prev,
                    availability: value,
                    sale_price: value === 'unsold' ? null : prev.sale_price // Clear sale price if unsold
                  }));
                }}
                required
                aria-invalid={!!validationErrors.availability}
                aria-describedby={validationErrors.availability ? "availability-error" : undefined}
              >
                <SelectTrigger className={validationErrors.availability ? "border-destructive" : ""}>
                  <SelectValue placeholder="Select Availability" />
                </SelectTrigger>
                <SelectContent>
                  {availabilities.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {validationErrors.availability && <p id="availability-error" className="text-destructive text-sm mt-1">{validationErrors.availability}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="purchase_date">Purchase Date *</Label>
              <Input
                id="purchase_date"
                type="date"
                value={formData.purchase_date}
                onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                required
                className={validationErrors.purchase_date ? "border-destructive" : ""}
                aria-invalid={!!validationErrors.purchase_date}
                aria-describedby={validationErrors.purchase_date ? "purchase-date-error" : undefined}
              />
              {validationErrors.purchase_date && <p id="purchase-date-error" className="text-destructive text-sm mt-1">{validationErrors.purchase_date}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchase_price">Purchase Price (Rs) *</Label>
              <Input
                id="purchase_price"
                type="number"
                value={formData.purchase_price === null ? '' : formData.purchase_price} // Display empty string if null
                onChange={(e) => setFormData({ ...formData, purchase_price: e.target.value === '' ? null : parseFloat(e.target.value) })}
                placeholder="e.g., 150000"
                required
                className={validationErrors.purchase_price ? "border-destructive" : ""}
                aria-invalid={!!validationErrors.purchase_price}
                aria-describedby={validationErrors.purchase_price ? "purchase-price-error" : undefined}
              />
              {validationErrors.purchase_price && <p id="purchase-price-error" className="text-destructive text-sm mt-1">{validationErrors.purchase_price}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sale_price">Sale Price (Rs)</Label>
            <Input
              id="sale_price"
              type="number"
              value={formData.sale_price === null ? '' : formData.sale_price} // Display empty string if null
              onChange={(e) => setFormData({ ...formData, sale_price: e.target.value === '' ? null : parseFloat(e.target.value) })}
              placeholder="e.g., 180000"
              disabled={formData.availability === 'unsold'} // Disable if not sold
              className={validationErrors.sale_price ? "border-destructive" : ""}
              aria-invalid={!!validationErrors.sale_price}
              aria-describedby={validationErrors.sale_price ? "sale-price-error" : undefined}
            />
            {formData.availability === 'unsold' && <p className="text-muted-foreground text-sm mt-1">Sale Price is applicable when availability is 'sold'.</p>}
            {validationErrors.sale_price && <p id="sale-price-error" className="text-destructive text-sm mt-1">{validationErrors.sale_price}</p>}
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
              ) : (editingRikshaw ? 'Update Rikshaw' : 'Add Rikshaw')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
});

// -------------------------------------------------------------------------
// RikshawDetailsDisplay Component
// -------------------------------------------------------------------------
interface RikshawDetailsDisplayProps {
  rikshaw: Rikshaw;
  onClose: () => void;
}

const RikshawDetailsDisplay = React.memo(({ rikshaw, onClose }: RikshawDetailsDisplayProps) => (
  <Card className="mt-6">
    <CardHeader className="flex flex-row items-center justify-between">
      <CardTitle>Rikshaw Details</CardTitle>
      <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close details">
        <XCircle className="h-5 w-5" />
      </Button>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div className="space-y-1">
          <p className="font-semibold">Manufacturer:</p>
          <p>{rikshaw.manufacturer}</p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold">Model:</p>
          <p>{rikshaw.model_name}</p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold">Type:</p>
          <p>{rikshaw.type}</p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold">Engine Number:</p>
          <p>{rikshaw.engine_number}</p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold">Chassis Number:</p>
          <p>{rikshaw.chassis_number}</p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold">Registration Number:</p>
          <p>{rikshaw.registration_number || 'N/A'}</p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold">Category:</p>
          <Badge variant={rikshaw.category === 'new' ? 'default' : 'outline'}>
            {rikshaw.category}
          </Badge>
        </div>
        <div className="space-y-1">
          <p className="font-semibold">Availability:</p>
          <Badge variant={rikshaw.availability === 'unsold' ? 'default' : 'secondary'}>
            {rikshaw.availability}
          </Badge>
        </div>
        <div className="space-y-1">
          <p className="font-semibold">Purchase Date:</p>
          <p>{new Date(rikshaw.purchase_date).toLocaleDateString()}</p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold">Purchase Price:</p>
          <p>Rs {rikshaw.purchase_price?.toLocaleString()}</p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold">Sale Price:</p>
          <p>{rikshaw.sale_price ? `Rs ${rikshaw.sale_price.toLocaleString()}` : 'N/A (Unsold)'}</p>
        </div>
        <div className="space-y-1 col-span-2">
          <p className="font-semibold">Date of Addition to Inventory</p>
          <p>{new Date(rikshaw.created_at).toLocaleDateString()} at {new Date(rikshaw.created_at).toLocaleTimeString()}</p>
        </div>
      </div>
    </CardContent>
  </Card>
));

// -------------------------------------------------------------------------
// Rikshaws Main Component
// -------------------------------------------------------------------------
const Rikshaws = () => {
  const ITEMS_PER_PAGE = 15;
  const [searchTerm, setSearchTerm] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  // Unified state for panel visibility: null (list), 'form' (add/edit), or Rikshaw object (details)
  const [showPanel, setShowPanel] = useState<'form' | Rikshaw | null>(null);
  const [editingRikshaw, setEditingRikshaw] = useState<Rikshaw | null>(null); // Still used for RikshawForm prop
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  const [formData, setFormData] = useState<RikshawFormData>({
    manufacturer: '',
    model_name: '',
    type: 'Loader 100 CC',
    engine_number: '',
    chassis_number: '',
    registration_number: '',
    category: 'new',
    availability: 'unsold',
    purchase_date: format(new Date(), 'yyyy-MM-dd'),
    purchase_price: null, // Initialize as null for empty input
    sale_price: null
  });

  const queryClient = useQueryClient();

  const types = ['Loader 100 CC', 'Loader 150 CC', 'Rikshaw 200 CC Family', 'Rikshaw 200 CC Open 6-seater'];

  // Debounce the search term update
  // MODIFICATION 1: Removed manual `queryClient.setQueryData` reset inside debounce
  const debouncedSetSearchTerm = useCallback(
    debounce((value) => {
      setSearchTerm(value); // This update will naturally cause queryKey change and refetch
    }, 300),
    [] // Dependencies: empty array means this debounced function is created once
  );

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Update the local state for the input field immediately for controlled component
    setSearchTerm(e.target.value);
    // Call the debounced function to update the query key, which triggers refetching
    // Note: The actual `searchTerm` in `queryKey` will only update after debounce delay
    debouncedSetSearchTerm(e.target.value);
  };

  const fetchRikshaws = useCallback(async ({ queryKey, pageParam = 0 }: { queryKey: any[]; pageParam?: number }) => {
    const [_key, currentSearchTerm, currentAvailabilityFilter, currentCategoryFilter, currentTypeFilter, limit] = queryKey;
    const offset = pageParam * limit;

    let query = supabase.from('rikshaws').select('*', { count: 'exact' });

    if (currentSearchTerm) {
      query = query.or(`manufacturer.ilike.%${currentSearchTerm}%,model_name.ilike.%${currentSearchTerm}%,engine_number.ilike.%${currentSearchTerm}%,chassis_number.ilike.%${currentSearchTerm}%,registration_number.ilike.%${currentSearchTerm}%,type.ilike.%${currentSearchTerm}%`);
    }

    if (currentAvailabilityFilter !== 'all') {
      query = query.eq('availability', currentAvailabilityFilter);
    }

    if (currentCategoryFilter !== 'all') {
      query = query.eq('category', currentCategoryFilter);
    }

    if (currentTypeFilter !== 'all') {
      query = query.eq('type', currentTypeFilter);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return { data: data as Rikshaw[], count: count as number, nextPage: pageParam + 1 };
  }, []);

  const {
    data,
    isLoading,
    isFetching, // This indicates a fetch is in progress for current queryKey
    isFetchingNextPage, // This indicates a fetch for the next page is in progress
    fetchNextPage,
    hasNextPage,
    refetch
  } = useInfiniteQuery({
    queryKey: ['rikshaws', searchTerm, availabilityFilter, categoryFilter, typeFilter, ITEMS_PER_PAGE],
    queryFn: fetchRikshaws,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const totalItemsFetched = lastPage.nextPage * ITEMS_PER_PAGE;
      if (totalItemsFetched < lastPage.count) {
        return lastPage.nextPage;
      }
      return undefined;
    },
    select: (data) => ({
      pages: data.pages,
      data: data.pages.flatMap(page => page.data),
      count: data.pages[0]?.count || 0,
      pageParams: data.pageParams
    }),
    staleTime: 5 * 60 * 1000,
    keepPreviousData: true, // MODIFICATION 2: Ensure this is true to keep old data visible
  });

  const allRikshaws = data?.data || [];
  const totalRikshawsCount = data?.count || 0;

  // Manual trigger for refetch when filters change (not debounced)
  useEffect(() => {
    // This will cause the queryKey to change and trigger a refetch,
    // and due to `keepPreviousData: true`, the old data will remain visible
    // while the new data is loading.
    // Setting search term to itself ensures the queryKey updates if only filters change
    setSearchTerm(prev => prev); // This might seem redundant but ensures queryKey changes for filters
  }, [availabilityFilter, categoryFilter, typeFilter]);


  const validateForm = useCallback(async (data: RikshawFormData, isEditMode: boolean = false) => {
    const errors: { [key: string]: string } = {};

    if (!data.manufacturer) errors.manufacturer = 'Manufacturer is required.';
    if (!data.model_name) errors.model_name = 'Model is required.';
    if (!data.type) errors.type = 'Type is required.';
    if (!data.engine_number) errors.engine_number = 'Engine Number is required.';
    if (!data.chassis_number) errors.chassis_number = 'Chassis Number is required.';
    if (!data.category) errors.category = 'Category is required.';
    if (!data.availability) errors.availability = 'Availability is required.';
    if (!data.purchase_date) errors.purchase_date = 'Purchase Date is required.';
    // MODIFICATION 3: Check for null and then <= 0 for purchase_price
    if (data.purchase_price === null || data.purchase_price <= 0) errors.purchase_price = 'Purchase Price must be greater than 0.';

    // MODIFICATION 4: Check for null and then <= 0 for sale_price
    if (data.availability === 'sold' && (data.sale_price === null || data.sale_price <= 0)) {
        errors.sale_price = 'Sale Price is required and must be greater than 0 when availability is "sold".';
    }


    // Unique checks for Engine Number and Chassis Number
    if (data.engine_number) {
      const { data: existingEngine, error: engineError } = await supabase
        .from('rikshaws')
        .select('id')
        .eq('engine_number', data.engine_number)
        .maybeSingle();

      if (engineError) console.error('Error checking engine number uniqueness:', engineError);

      if (existingEngine && (isEditMode ? existingEngine.id !== editingRikshaw?.id : true)) {
        errors.engine_number = 'This Engine Number already exists.';
      }
    }

    if (data.chassis_number) {
      const { data: existingChassis, error: chassisError } = await supabase
        .from('rikshaws')
        .select('id')
        .eq('chassis_number', data.chassis_number)
        .maybeSingle();

      if (chassisError) console.error('Error checking chassis number uniqueness:', chassisError);

      if (existingChassis && (isEditMode ? existingChassis.id !== editingRikshaw?.id : true)) {
        errors.chassis_number = 'This Chassis Number already exists.';
      }
    }

    if (data.registration_number) {
      const { data: existingReg, error: regError } = await supabase
        .from('rikshaws')
        .select('id')
        .eq('registration_number', data.registration_number)
        .maybeSingle();

      if (regError) console.error('Error checking registration number uniqueness:', regError);

      if (existingReg && (isEditMode ? existingReg.id !== editingRikshaw?.id : true)) {
        errors.registration_number = 'This Registration Number already exists.';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [editingRikshaw]); // Dependency on editingRikshaw to correctly handle uniqueness check in edit mode

  const addRikshawMutation = useMutation({
    mutationFn: async (newRikshaw: RikshawFormData) => {
      // Validate data before mutation
      const isValid = await validateForm(newRikshaw, false);
      if (!isValid) {
        throw new Error('Validation failed. Please check the form.');
      }

      const { data, error } = await supabase
        .from('rikshaws')
        .insert([{
          manufacturer: newRikshaw.manufacturer,
          model_name: newRikshaw.model_name,
          type: newRikshaw.type as Rikshaw['type'],
          engine_number: newRikshaw.engine_number,
          chassis_number: newRikshaw.chassis_number,
          registration_number: newRikshaw.registration_number || null,
          category: newRikshaw.category as Rikshaw['category'],
          availability: newRikshaw.availability as Rikshaw['availability'],
          purchase_date: newRikshaw.purchase_date,
          purchase_price: newRikshaw.purchase_price as number, // Ensure number for DB
          sale_price: newRikshaw.availability === 'sold' ? newRikshaw.sale_price : null
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rikshaws'] });
      setShowPanel(null); // Return to list view
      resetForm();
      toast({
        title: "Success",
        description: "Rikshaw added successfully!"
      });
    },
    onError: (error) => {
      console.error('Add rikshaw error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to add rikshaw. Please try again.",
        variant: "destructive"
      });
    }
  });

  const updateRikshawMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: RikshawFormData }) => {
      // Validate data before mutation
      const isValid = await validateForm(updates, true);
      if (!isValid) {
        throw new Error('Validation failed. Please check the form.');
      }

      const { data, error } = await supabase
        .from('rikshaws')
        .update({
          manufacturer: updates.manufacturer,
          model_name: updates.model_name,
          type: updates.type as Rikshaw['type'],
          engine_number: updates.engine_number,
          chassis_number: updates.chassis_number,
          registration_number: updates.registration_number || null,
          category: updates.category as Rikshaw['category'],
          availability: updates.availability as Rikshaw['availability'],
          purchase_date: updates.purchase_date,
          purchase_price: updates.purchase_price as number, // Ensure number for DB
          sale_price: updates.availability === 'sold' ? updates.sale_price : null
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rikshaws'] });
      setShowPanel(null); // Return to list view
      setEditingRikshaw(null);
      resetForm();
      toast({
        title: "Success",
        description: "Rikshaw updated successfully!"
      });
    },
    onError: (error) => {
      console.error('Update rikshaw error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update rikshaw. Please try again.",
        variant: "destructive"
      });
    }
  });

  const deleteRikshawMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('rikshaws')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rikshaws'] });
      // If the deleted rikshaw was the one being viewed, close the details panel
      if (typeof showPanel !== 'string' && showPanel?.id) {
        setShowPanel(null);
      }
      toast({
        title: "Success",
        description: "Rikshaw deleted successfully!"
      });
    },
    onError: (error) => {
      console.error('Delete rikshaw error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete rikshaw. Please try again.",
        variant: "destructive"
      });
    }
  });

  const resetForm = useCallback(() => {
    setFormData({
      manufacturer: '',
      model_name: '',
      type: 'Loader 100 CC',
      engine_number: '',
      chassis_number: '',
      registration_number: '',
      category: 'new',
      availability: 'unsold',
      purchase_date: format(new Date(), 'yyyy-MM-dd'),
      purchase_price: null,
      sale_price: null
    });
    setValidationErrors({});
  }, []);

  const handleAddClick = useCallback(() => {
    resetForm();
    setEditingRikshaw(null);
    setShowPanel('form'); // Show form for adding
  }, [resetForm]);

  const handleFormCancel = useCallback(() => {
    setShowPanel(null); // Return to list view
    setEditingRikshaw(null);
    resetForm();
  }, [resetForm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationErrors({}); // Clear errors before validating (validation is handled in mutationFn)

    // The validation is now handled inside the mutationFn.
    // If validation fails, the mutationFn will throw an error,
    // which then triggers the onError callback to show a toast.
    if (editingRikshaw) {
      updateRikshawMutation.mutate({ id: editingRikshaw.id, updates: formData });
    } else {
      addRikshawMutation.mutate(formData);
    }
  };

  const handleEdit = useCallback((rikshaw: Rikshaw) => {
    setEditingRikshaw(rikshaw);
    setFormData({
      manufacturer: rikshaw.manufacturer,
      model_name: rikshaw.model_name,
      type: rikshaw.type,
      engine_number: rikshaw.engine_number,
      chassis_number: rikshaw.chassis_number,
      registration_number: rikshaw.registration_number || '',
      category: rikshaw.category,
      availability: rikshaw.availability,
      purchase_date: rikshaw.purchase_date,
      purchase_price: rikshaw.purchase_price,
      sale_price: rikshaw.sale_price,
    });
    setValidationErrors({});
    setShowPanel('form'); // Show form for editing
  }, []);

  const handleDelete = useCallback((id: string) => {
    if (window.confirm('Are you sure you want to delete this rikshaw? This action cannot be undone.')) {
      deleteRikshawMutation.mutate(id);
    }
  }, [deleteRikshawMutation, showPanel]);

  const handleViewDetails = useCallback((rikshaw: Rikshaw) => {
    setEditingRikshaw(null); // Ensure editing state is clear
    setShowPanel(rikshaw); // Show details for this rikshaw
    resetForm(); // Clear form data just in case
  }, [resetForm]);

  const handleCloseDetails = useCallback(() => {
    setShowPanel(null); // Return to list view
  }, []);

  const getAvailabilityBadgeVariant = (availability: string) => {
    switch (availability) {
      case 'unsold':
        return 'default';
      case 'sold':
        return 'secondary';
      default:
        return 'default';
    }
  };

  const getCategoryBadgeVariant = (category: string) => {
    switch (category) {
      case 'new':
        return 'default';
      case 'old':
        return 'outline';
      default:
        return 'default';
    }
  };

  // Condition to show initial loading state
  // Check if data is truly empty and a fetch is not in progress (i.e., not just transitioning)
  const showInitialLoading = isLoading && !allRikshaws.length && showPanel === null;

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Rikshaws Management</h1>
            <p className="text-muted-foreground">Manage your rikshaw inventory</p>
          </div>

          {/* Show Add Rikshaw button only when the main list is visible */}
          {showPanel === null && (
            <Button onClick={handleAddClick} aria-label="Add new rikshaw">
              <Plus className="h-4 w-4 mr-2" />
              Add Rikshaw
            </Button>
          )}
        </div>

        {/* Conditionally render RikshawForm or RikshawDetailsDisplay based on showPanel */}
        {/* MODIFICATION 5: Wrap conditional content in aria-live for accessibility */}
        <div aria-live="polite">
          {showPanel === 'form' && (
            <RikshawForm
              onSubmit={handleSubmit}
              isLoading={addRikshawMutation.isPending || updateRikshawMutation.isPending}
              onCancel={handleFormCancel}
              formData={formData}
              setFormData={setFormData}
              editingRikshaw={editingRikshaw}
              validationErrors={validationErrors}
            />
          )}

          {typeof showPanel !== 'string' && showPanel !== null && (
            <RikshawDetailsDisplay rikshaw={showPanel} onClose={handleCloseDetails} />
          )}
        </div>
        
        {/* Main Rikshaw List Card - visible only when no other panel is shown */}
        {showPanel === null && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Car className="h-5 w-5" />
                Inventory Overview
              </CardTitle>
              <CardDescription>
                Total: {totalRikshawsCount} rikshaws (Showing {allRikshaws.length} of {totalRikshawsCount})
                {/* Show a subtle loading indicator next to total count when fetching in background */}
                {(isFetching && !isFetchingNextPage) && (
                    <Loader2 className="inline-block ml-2 h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading..." />
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 mb-6 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by manufacturer, model, engine, chassis, reg. no., or type..."
                      value={searchTerm}
                      onChange={handleSearchInputChange} // Debounced handler
                      className="pl-10"
                      aria-label="Search rikshaws"
                    />
                  </div>
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[180px]" aria-label="Filter by category">
                    <SelectValue placeholder="Filter by Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="old">Old</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
                  <SelectTrigger className="w-[180px]" aria-label="Filter by availability">
                    <SelectValue placeholder="Filter by Availability" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Availability</SelectItem>
                    <SelectItem value="unsold">Unsold</SelectItem>
                    <SelectItem value="sold">Sold</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[180px]" aria-label="Filter by type">
                    <SelectValue placeholder="Filter by Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {types.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Manufacturer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Engine Number</TableHead>
                      <TableHead>Purchase Price</TableHead>
                      <TableHead>Availability</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Render data if available, otherwise show empty state/loading */}
                    {allRikshaws.length === 0 && !isFetching && !isFetchingNextPage ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12">
                          <Car className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                          <p className="text-muted-foreground mb-2">No rikshaws found</p>
                          <p className="text-sm text-muted-foreground">
                            {searchTerm || availabilityFilter !== 'all' || categoryFilter !== 'all' || typeFilter !== 'all'
                              ? 'Try adjusting your search or filters'
                              : 'Add your first rikshaw to get started'
                            }
                          </p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      allRikshaws.map((rikshaw) => (
                        <TableRow key={rikshaw.id}>
                          <TableCell className="font-medium">{rikshaw.manufacturer}</TableCell>
                          <TableCell>{rikshaw.type}</TableCell>
                          <TableCell className="font-mono text-sm">{rikshaw.engine_number}</TableCell>
                          <TableCell>Rs {rikshaw.purchase_price?.toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant={getAvailabilityBadgeVariant(rikshaw.availability)}>
                              {rikshaw.availability}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewDetails(rikshaw)}
                                aria-label={`View details of ${rikshaw.manufacturer} ${rikshaw.model_name}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(rikshaw)}
                                aria-label={`Edit ${rikshaw.manufacturer} ${rikshaw.model_name}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(rikshaw.id)}
                                disabled={deleteRikshawMutation.isPending}
                                aria-label={`Delete ${rikshaw.manufacturer} ${rikshaw.model_name}`}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                    {/* Show row-level loading for "show more" only */}
                    {isFetchingNextPage && (
                        <TableRow>
                            <TableCell colSpan={6} className="text-center py-4">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
                                <p className="text-muted-foreground text-sm mt-2">Loading more...</p>
                            </TableCell>
                        </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {hasNextPage && (
                <div className="text-center mt-6">
                  <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage} aria-label="Load more rikshaws">
                    {isFetchingNextPage ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      'Show More'
                    )}
                  </Button>
                </div>
              )}

              {!hasNextPage && allRikshaws.length > 0 && !isFetching && !isFetchingNextPage && (
                <p className="text-center text-muted-foreground text-sm mt-6">
                  You've reached the end of the list.
                </p>
              )}

            </CardContent>
          </Card>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default Rikshaws;