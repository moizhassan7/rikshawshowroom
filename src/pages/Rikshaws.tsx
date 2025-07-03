import { useState, useCallback, useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'; // Changed to useInfiniteQuery
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
}

// -------------------------------------------------------------------------
// RikshawForm Component (Moved outside for focus issue fix)
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

const RikshawForm = ({ onSubmit, isLoading, onCancel, formData, setFormData, editingRikshaw, validationErrors }: RikshawFormProps) => {
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
              {validationErrors.manufacturer && <p className="text-destructive text-sm mt-1">{validationErrors.manufacturer}</p>}
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
              />
              {validationErrors.model_name && <p className="text-destructive text-sm mt-1">{validationErrors.model_name}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Type *</Label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData({ ...formData, type: value })}
              required
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
            {validationErrors.type && <p className="text-destructive text-sm mt-1">{validationErrors.type}</p>}
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
              />
              {validationErrors.engine_number && <p className="text-destructive text-sm mt-1">{validationErrors.engine_number}</p>}
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
              />
              {validationErrors.chassis_number && <p className="text-destructive text-sm mt-1">{validationErrors.chassis_number}</p>}
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
            />
            {validationErrors.registration_number && <p className="text-destructive text-sm mt-1">{validationErrors.registration_number}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
                required
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
              {validationErrors.category && <p className="text-destructive text-sm mt-1">{validationErrors.category}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="availability">Availability *</Label>
              <Select
                value={formData.availability}
                onValueChange={(value) => setFormData({ ...formData, availability: value })}
                required
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
              {validationErrors.availability && <p className="text-destructive text-sm mt-1">{validationErrors.availability}</p>}
            </div>
          </div>

          <div className="flex gap-2 justify-end mt-6">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
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
};

// -------------------------------------------------------------------------
// RikshawDetailsDisplay Component (Moved outside)
// -------------------------------------------------------------------------
interface RikshawDetailsDisplayProps {
  rikshaw: Rikshaw;
  onClose: () => void;
}

const RikshawDetailsDisplay = ({ rikshaw, onClose }: RikshawDetailsDisplayProps) => (
  <Card className="mt-6">
    <CardHeader className="flex flex-row items-center justify-between">
      <CardTitle>Rikshaw Details</CardTitle>
      <Button variant="ghost" size="icon" onClick={onClose}>
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
        <div className="space-y-1 col-span-2">
          <p className="font-semibold">Date of Addition to Inventory</p>
          <p>{new Date(rikshaw.created_at).toLocaleDateString()} at {new Date(rikshaw.created_at).toLocaleTimeString()}</p>
        </div>
      </div>
    </CardContent>
  </Card>
);

// -------------------------------------------------------------------------
// Rikshaws Main Component
// -------------------------------------------------------------------------
const Rikshaws = () => {
  const ITEMS_PER_PAGE = 15;
  const [searchTerm, setSearchTerm] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all'); // State for type filter
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingRikshaw, setEditingRikshaw] = useState<Rikshaw | null>(null);
  const [selectedRikshaw, setSelectedRikshaw] = useState<Rikshaw | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  const [formData, setFormData] = useState<RikshawFormData>({
    manufacturer: '',
    model_name: '',
    type: 'Loader 100 CC',
    engine_number: '',
    chassis_number: '',
    registration_number: '',
    category: 'new',
    availability: 'unsold'
  });

  const queryClient = useQueryClient();

  const types = ['Loader 100 CC', 'Loader 150 CC', 'Rikshaw 200 CC Family', 'Rikshaw 200 CC Open 6-seater']; // Available types for filter

  // Optimized fetch function for useInfiniteQuery
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
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    refetch // Added refetch
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
      // Flatten pages into a single array of rikshaws
      data: data.pages.flatMap(page => page.data),
      // Keep the total count from the first page or last page if available
      count: data.pages[0]?.count || 0,
      pageParams: data.pageParams
    }),
    staleTime: 5 * 60 * 1000,
  });

  const allRikshaws = data?.data || [];
  const totalRikshawsCount = data?.count || 0;

  // No need for a manual useEffect to reset page for filters with useInfiniteQuery,
  // as changing the queryKey automatically causes a refetch from initialPageParam.

  const validateForm = async (data: RikshawFormData, isEditMode: boolean = false) => {
    const errors: { [key: string]: string } = {};

    if (!data.manufacturer) errors.manufacturer = 'Manufacturer is required.';
    if (!data.model_name) errors.model_name = 'Model is required.';
    if (!data.type) errors.type = 'Type is required.';
    if (!data.engine_number) errors.engine_number = 'Engine Number is required.';
    if (!data.chassis_number) errors.chassis_number = 'Chassis Number is required.';
    if (!data.category) errors.category = 'Category is required.';
    if (!data.availability) errors.availability = 'Availability is required.';

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
  };

  const addRikshawMutation = useMutation({
    mutationFn: async (newRikshaw: RikshawFormData) => {
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
          availability: newRikshaw.availability as Rikshaw['availability']
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rikshaws'] }); // Invalidate to refetch all filtered data
      setIsFormVisible(false);
      setSelectedRikshaw(null);
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
          availability: updates.availability as Rikshaw['availability']
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rikshaws'] }); // Invalidate to refetch all filtered data
      setIsFormVisible(false);
      setEditingRikshaw(null);
      setSelectedRikshaw(null);
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
      queryClient.invalidateQueries({ queryKey: ['rikshaws'] }); // Invalidate to refetch all filtered data
      setSelectedRikshaw(null);
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

  const resetForm = () => {
    setFormData({
      manufacturer: '',
      model_name: '',
      type: 'Loader 100 CC',
      engine_number: '',
      chassis_number: '',
      registration_number: '',
      category: 'new',
      availability: 'unsold'
    });
    setValidationErrors({});
  };

  const handleAddClick = () => {
    resetForm();
    setEditingRikshaw(null);
    setSelectedRikshaw(null);
    setIsFormVisible(true);
  };

  const handleFormCancel = () => {
    setIsFormVisible(false);
    setEditingRikshaw(null);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationErrors({});

    const isValid = await validateForm(formData, !!editingRikshaw);

    if (!isValid) {
      toast({
        title: "Validation Error",
        description: "Please correct the highlighted fields.",
        variant: "destructive"
      });
      return;
    }

    if (editingRikshaw) {
      updateRikshawMutation.mutate({ id: editingRikshaw.id, updates: formData });
    } else {
      addRikshawMutation.mutate(formData);
    }
  };

  const handleEdit = (rikshaw: Rikshaw) => {
    setSelectedRikshaw(rikshaw);
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
    });
    setIsFormVisible(true);
    setValidationErrors({});
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this rikshaw?')) {
      deleteRikshawMutation.mutate(id);
    }
  };

  const handleViewDetails = (rikshaw: Rikshaw) => {
    setIsFormVisible(false);
    setEditingRikshaw(null);
    setSelectedRikshaw(rikshaw);
    setValidationErrors({});
  };

  const handleCloseDetails = () => {
    setSelectedRikshaw(null);
  };

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
  // Check if it's the very first load and no data has been fetched yet
  if (isLoading && !allRikshaws.length) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <Car className="h-12 w-12 animate-pulse mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Loading rikshaws...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rikshaws</h1>
          <p className="text-muted-foreground">Manage your rikshaw inventory</p>
        </div>

        {!isFormVisible && !selectedRikshaw && (
          <Button onClick={handleAddClick}>
            <Plus className="h-4 w-4 mr-2" />
            Add Rikshaw
          </Button>
        )}
      </div>

      {isFormVisible && (
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

      {!isFormVisible && selectedRikshaw && (
        <RikshawDetailsDisplay rikshaw={selectedRikshaw} onClose={handleCloseDetails} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Inventory Overview
          </CardTitle>
          <CardDescription>
            Total: {totalRikshawsCount} rikshaws (Showing {allRikshaws.length} of {totalRikshawsCount})
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
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="old">Old</SelectItem>
              </SelectContent>
            </Select>
            <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Availability" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Availability</SelectItem>
                <SelectItem value="unsold">Unsold</SelectItem>
                <SelectItem value="sold">Sold</SelectItem>
              </SelectContent>
            </Select>
            {/* New Type Filter */}
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
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
                  <TableHead>Availability</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allRikshaws.length === 0 && !isFetching && !isFetchingNextPage ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
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
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(rikshaw)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(rikshaw.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
                {isFetchingNextPage && allRikshaws.length > 0 && ( // Show loader when fetching more, if items already exist
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-4">
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
              <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
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
    </div>
  );
};

export default Rikshaws;