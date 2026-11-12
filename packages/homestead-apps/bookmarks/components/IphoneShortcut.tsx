import { useState } from 'react';
import { Smartphone } from 'lucide-react';
import { useAppFlag } from '@rambleraptor/homestead-core/settings';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import { DROP_BOX_URL_FLAG, dropBoxBase } from '../dropBox';
import { DirectSetup } from './iphone/DirectSetup';
import { DropBoxSetup } from './iphone/DropBoxSetup';

/**
 * "Save from iPhone": iOS won't let an installed web app appear in the share
 * sheet, so saving from another app there goes through Apple's Shortcuts — a
 * shortcut that posts the shared link.
 *
 * Where it posts depends on the Homestead. One with a drop box configured (it
 * sits behind a login a shortcut can't pass) has the shortcut post there, and
 * collects. Otherwise the shortcut posts straight to Homestead with a key of
 * its own.
 */
export function IphoneShortcut() {
  const [open, setOpen] = useState(false);
  const { value: configured } = useAppFlag<string>('bookmarks', DROP_BOX_URL_FLAG);
  const dropBox = dropBoxBase(configured);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="iphone-shortcut-open"
      >
        <Smartphone className="mr-1 size-4" aria-hidden />
        Save from iPhone
      </Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Save from iPhone">
        {/* Mounted only while open: closing forgets a key or address, which is shown once. */}
        {open && (dropBox ? <DropBoxSetup base={dropBox} /> : <DirectSetup />)}
      </Modal>
    </>
  );
}
