export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware';
import { clientUpdateSchema } from '@/lib/validators';

/**
 * PUT /api/clients/[id]
 * Updates an existing client's details.
 */
export const PUT = withAuth(async (req, user, supabase, context) => {
  try {
    const { id } = context.params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Client ID parameter is required.' },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));

    // Zod validation
    const validationResult = clientUpdateSchema.safeParse(body);
    if (!validationResult.success) {
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

    // Build update object
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (industry !== undefined) updateData.industry = industry;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No fields provided for update.' },
        { status: 400 }
      );
    }

    // Update Client in DB with ownership validation
    const { data: updatedClient, error } = await supabase
      .from('clients')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id) // Enforce ownership
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: `Failed to update client: ${error.message}` },
        { status: 500 }
      );
    }

    if (!updatedClient) {
      return NextResponse.json(
        { success: false, error: 'Client not found or access denied.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedClient,
    });
  } catch (err: any) {
    console.error('Update client API error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error while updating client.' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/clients/[id]
 * Deletes a client and cascades to delete all their integrations.
 */
export const DELETE = withAuth(async (req, user, supabase, context) => {
  try {
    const { id } = context.params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Client ID parameter is required.' },
        { status: 400 }
      );
    }

    // Database Delete with ownership validation
    // The foreign keys in integrations and reports are ON DELETE CASCADE,
    // so deleting the client will automatically purge related integrations and reports from DB.
    const { data: deletedClient, error } = await supabase
      .from('clients')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id) // Enforce ownership
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: `Failed to delete client: ${error.message}` },
        { status: 500 }
      );
    }

    if (!deletedClient) {
      return NextResponse.json(
        { success: false, error: 'Client not found or access denied.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Client and all associated integrations/reports have been successfully deleted.',
      data: deletedClient,
    });
  } catch (err: any) {
    console.error('Delete client API error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error while deleting client.' },
      { status: 500 }
    );
  }
});
