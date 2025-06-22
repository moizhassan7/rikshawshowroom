
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Car, Plus, Search, Edit, Trash2 } from 'lucide-react';
import { Tables } from '@/integrations/supabase/types';

type Rikshaw = Tables<'rikshaws'>;

const Rikshaws = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRikshaw, setEditingRikshaw] = useState<Rikshaw | null>(null);
  const [formData, setFormData] = useState({
    model: '',
    color: '',
    engine_number: '',
    price: '',
    status: 'available'
  });

  const queryClient = useQueryClient();

  const { data: rikshaws, isLoading } = useQuery({
    queryKey: ['rikshaws'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rikshaws')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  const addRikshawMutation = useMutation({
    mutationFn: async (newRikshaw: any) => {
      const { data, error } = await supabase
        .from('rikshaws')
        .insert([{
          model: newRikshaw.model,
          color: newRikshaw.color,
          engine_number: newRikshaw.engine_number,
          price: parseFloat(newRikshaw.price),
          status: newRikshaw.status
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rikshaws'] });
      setIsDialogOpen(false);
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
        description: "Failed to add rikshaw. Please try again.",
        variant: "destructive"
      });
    }
  });

  const updateRikshawMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { data, error } = await supabase
        .from('rikshaws')
        .update({
          model: updates.model,
          color: updates.color,
          engine_number: updates.engine_number,
          price: parseFloat(updates.price),
          status: updates.status
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rikshaws'] });
      setIsDialogOpen(false);
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
        description: "Failed to update rikshaw. Please try again.",
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
      toast({
        title: "Success",
        description: "Rikshaw deleted successfully!"
      });
    },
    onError: (error) => {
      console.error('Delete rikshaw error:', error);
      toast({
        title: "Error",
        description: "Failed to delete rikshaw. Please try again.",
        variant: "destructive"
      });
    }
  });

  const resetForm = () => {
    setFormData({
      model: '',
      color: '',
      engine_number: '',
      price: '',
      status: 'available'
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.model || !formData.color || !formData.engine_number || !formData.price) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
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
    setEditingRikshaw(rikshaw);
    setFormData({
      model: rikshaw.model,
      color: rikshaw.color,
      engine_number: rikshaw.engine_number,
      price: rikshaw.price.toString(),
      status: rikshaw.status
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this rikshaw?')) {
      deleteRikshawMutation.mutate(id);
    }
  };

  const filteredRikshaws = rikshaws?.filter(rikshaw => {
    const matchesSearch = rikshaw.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         rikshaw.color.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         rikshaw.engine_number.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || rikshaw.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'available':
        return 'default';
      case 'sold':
        return 'secondary';
      case 'reserved':
        return 'outline';
      default:
        return 'default';
    }
  };

  if (isLoading) {
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
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingRikshaw(null); resetForm(); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Rikshaw
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>
                {editingRikshaw ? 'Edit Rikshaw' : 'Add New Rikshaw'}
              </DialogTitle>
              <DialogDescription>
                {editingRikshaw ? 'Update the rikshaw details below.' : 'Fill in the details to add a new rikshaw to your inventory.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="model">Model *</Label>
                  <Input
                    id="model"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    placeholder="e.g., CNG Rikshaw"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="color">Color *</Label>
                  <Input
                    id="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    placeholder="e.g., Yellow"
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="engine_number">Engine Number *</Label>
                <Input
                  id="engine_number"
                  value={formData.engine_number}
                  onChange={(e) => setFormData({ ...formData, engine_number: e.target.value })}
                  placeholder="e.g., ENG123456"
                  required
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Price (Rs) *</Label>
                  <Input
                    id="price"
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="e.g., 250000"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">Available</SelectItem>
                      <SelectItem value="sold">Sold</SelectItem>
                      <SelectItem value="reserved">Reserved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsDialogOpen(false);
                    setEditingRikshaw(null);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={addRikshawMutation.isPending || updateRikshawMutation.isPending}
                >
                  {editingRikshaw ? 'Update' : 'Add'} Rikshaw
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Inventory Overview
          </CardTitle>
          <CardDescription>
            Total: {rikshaws?.length || 0} rikshaws
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by model, color, or engine number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="sold">Sold</SelectItem>
                <SelectItem value="reserved">Reserved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Engine Number</TableHead>
                  <TableHead>Price (Rs)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRikshaws?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <Car className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <p className="text-muted-foreground mb-2">No rikshaws found</p>
                      <p className="text-sm text-muted-foreground">
                        {searchTerm || statusFilter !== 'all' 
                          ? 'Try adjusting your search or filters'
                          : 'Add your first rikshaw to get started'
                        }
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRikshaws?.map((rikshaw) => (
                    <TableRow key={rikshaw.id}>
                      <TableCell className="font-medium">{rikshaw.model}</TableCell>
                      <TableCell>{rikshaw.color}</TableCell>
                      <TableCell className="font-mono text-sm">{rikshaw.engine_number}</TableCell>
                      <TableCell>{rikshaw.price.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(rikshaw.status)}>
                          {rikshaw.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
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
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Rikshaws;
