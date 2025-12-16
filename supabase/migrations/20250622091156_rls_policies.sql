
-- Enable RLS on the customers table
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for customers table
CREATE POLICY "Authenticated users can view all customers" 
  ON public.customers 
  FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Authenticated users can create customers" 
  ON public.customers 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update customers" 
  ON public.customers 
  FOR UPDATE 
  TO authenticated 
  USING (true);

CREATE POLICY "Authenticated users can delete customers" 
  ON public.customers 
  FOR DELETE 
  TO authenticated 
  USING (true);

-- Enable RLS on rikshaws table (if not already enabled)
ALTER TABLE public.rikshaws ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for rikshaws table
CREATE POLICY "Authenticated users can view all rikshaws" 
  ON public.rikshaws 
  FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Authenticated users can update rikshaws" 
  ON public.rikshaws 
  FOR UPDATE 
  TO authenticated 
  USING (true);

-- Enable RLS on installment_plans table (if not already enabled)
ALTER TABLE public.installment_plans ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for installment_plans table
CREATE POLICY "Authenticated users can view all installment plans" 
  ON public.installment_plans 
  FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Authenticated users can create installment plans" 
  ON public.installment_plans 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update installment plans" 
  ON public.installment_plans 
  FOR UPDATE 
  TO authenticated 
  USING (true);

-- Enable RLS on installments table (if not already enabled)
ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for installments table
CREATE POLICY "Authenticated users can view all installments" 
  ON public.installments 
  FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Authenticated users can create installments" 
  ON public.installments 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update installments" 
  ON public.installments 
  FOR UPDATE 
  TO authenticated 
  USING (true);
