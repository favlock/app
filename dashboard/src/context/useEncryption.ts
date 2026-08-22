import { useContext } from 'react';
import { EncryptionContext } from './EncryptionContext';

export function useEncryption() {
  const ctx = useContext(EncryptionContext);
  if (!ctx) throw new Error('useEncryption must be used within EncryptionProvider');
  return ctx;
}
