export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware';
import { clientCreateSchema } from '@/lib/validators';

/**
 * GET /api/clients
 * Lists all clients for the current authenticated user.
 */
export const GET = withAuth(async (req, user, supabase) => {
  try {
    const { data: clients, error } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', user.id) // Application-layer ownership check
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch clients: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: clients,
    });
  } catch (err: any) {
    console.error('List clients API error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error while listing clients.' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/clients
 * Creates a new client for the current user.
 */
export const POST = withAuth(async (req, user, supabase) => {
  try {
    const body = await req.json().catch(() => ({}));
    
    // Zod validation
    const validationResult = clientCreateSchema.safeParse(body);
    if (!validationResult.success) {
      // Return 400 with field-level errors formatted cleanly
      return NextResponse.json(
        { 
          success: false, 
          error: 'Validation failed.', 
          details: validationResult.error.flatten().fieldErrors 
        },
        { status: 400 }
      );
    }

    const { name, industry } = validationResult.data;

    // Database Insert
    const { data: newClient, error } = await supabase
      .from('clients')
      .insert({
        user_id: user.id, // Enforce ownership
        name,
        industry: industry || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: `Failed to create client: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, data: newClient },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Create client API error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error while creating client.' },
      { status: 500 }
    );
  }
});
