/**
 * Runtime disposition is derived only from the private, byte-verified
 * admission context. The context module owns the WeakSet/record map; this
 * facade intentionally exposes no fixture or filesystem seam.
 */
export {
  deriveAdmissionDisposition,
  type AdmissionDispositionResult,
} from './admission-context';
