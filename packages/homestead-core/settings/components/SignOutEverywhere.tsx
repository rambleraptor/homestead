import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { useLogoutEverywhere } from '../hooks/useLogoutEverywhere';

/**
 * "Sign out everywhere" — drops every session the user holds on other devices.
 * This tab keeps working: the server hands back a fresh session to replace the
 * one it just revoked.
 */
export function SignOutEverywhere() {
  const [confirming, setConfirming] = useState(false);
  const logoutEverywhere = useLogoutEverywhere();
  const { success, error: showError } = useToast();

  const handleConfirm = async () => {
    try {
      await logoutEverywhere.mutateAsync();
      success('Signed out on all other devices');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sign out other devices';
      showError(message);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Card>
      <div className="flex items-start gap-4">
        <LogOut className="w-6 h-6 text-text-muted mt-1" />
        <div className="flex-1">
          <h3 className="font-semibold text-brand-navy mb-2">Sign Out Everywhere</h3>
          <p className="text-sm text-text-muted mb-4">
            End your sessions on every other browser and device. You&apos;ll stay signed
            in here. Personal access tokens keep working — revoke those under
            Connections.
          </p>
          <Button
            variant="secondary"
            onClick={() => setConfirming(true)}
            disabled={logoutEverywhere.isPending}
            data-testid="sign-out-everywhere"
          >
            {logoutEverywhere.isPending ? 'Signing out…' : 'Sign Out Everywhere'}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirming}
        title="Sign out everywhere?"
        message="Every other browser and device will be signed out immediately. This session stays active."
        confirmLabel="Sign Out Everywhere"
        variant="danger"
        isLoading={logoutEverywhere.isPending}
        onConfirm={handleConfirm}
        onClose={() => setConfirming(false)}
      />
    </Card>
  );
}
