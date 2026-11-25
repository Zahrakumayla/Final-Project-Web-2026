-- ============================================================
-- MIGRASI 001: Manager memilih penyelesaian klaim
-- Jalankan SEKALI di pgAdmin pada database yang sudah berjalan
-- (data tidak dihapus, aman dijalankan berulang).
-- Instalasi baru cukup menjalankan AYVORA_FINAL_DATABASE.sql.
-- ============================================================

ALTER TABLE claims ADD COLUMN IF NOT EXISTS requested_resolution VARCHAR(20);
ALTER TABLE claims ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS request_note TEXT;
DO $$ BEGIN
    ALTER TABLE claims ADD CONSTRAINT chk_claim_requested
        CHECK (requested_resolution IS NULL OR requested_resolution IN ('Replacement', 'Refund'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION guard_claim_update()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.restock_order_id <> OLD.restock_order_id OR NEW.inspection_id <> OLD.inspection_id
       OR NEW.supplier_id <> OLD.supplier_id OR NEW.claim_type <> OLD.claim_type
       OR NEW.product_id <> OLD.product_id OR NEW.quantity <> OLD.quantity THEN
        RAISE EXCEPTION 'Data dasar klaim tidak dapat diubah.';
    END IF;
    IF NEW.resolved_quantity < OLD.resolved_quantity THEN
        RAISE EXCEPTION 'Jumlah yang sudah diselesaikan tidak boleh berkurang.';
    END IF;

    IF NEW.status = OLD.status THEN
        IF OLD.status IN ('Resolved', 'Claim Rejected') THEN
            RAISE EXCEPTION 'Klaim yang sudah ditutup tidak dapat diubah.';
        END IF;
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'Claim Submitted'        AND NEW.status IN ('Disputed', 'Replacement In Transit', 'Refund Processing')) OR
        (OLD.status = 'Disputed'               AND NEW.status IN ('Claim Rejected', 'Claim Submitted')) OR
        (OLD.status = 'Replacement In Transit' AND NEW.status IN ('Resolved', 'Claim Submitted')) OR
        (OLD.status = 'Refund Processing'      AND NEW.status = 'Resolved')
    ) THEN
        RAISE EXCEPTION 'Perubahan status klaim dari % ke % tidak diizinkan.', OLD.status, NEW.status;
    END IF;

    IF NEW.status = 'Replacement In Transit' AND NOT EXISTS (
        SELECT 1 FROM inbound_shipments WHERE claim_id = NEW.id AND status = 'In Transit'
    ) THEN
        RAISE EXCEPTION 'Status Replacement In Transit hanya lewat pengiriman barang pengganti.';
    END IF;

    -- Pengganti diterima sebagian: sisa klaim menunggu keputusan Manager lagi
    IF NEW.status = 'Claim Submitted' AND OLD.status = 'Replacement In Transit' THEN
        NEW.requested_resolution := NULL;
        NEW.requested_by := NULL;
        NEW.requested_at := NULL;
        NEW.request_note := NULL;
    END IF;

    IF NEW.status = 'Refund Processing' THEN
        NEW.resolution := 'Refund';
        NEW.refund_submitted_at := NOW();
        NEW.refund_proof_invalid := FALSE;
    END IF;

    IF NEW.status = 'Disputed' THEN
        NEW.disputed_at := NOW();
    END IF;

    IF NEW.status = 'Claim Submitted' AND OLD.status = 'Disputed'
       AND (NEW.dispute_decision_note IS NULL OR TRIM(NEW.dispute_decision_note) = '') THEN
        RAISE EXCEPTION 'Alasan menolak sanggahan wajib diisi.';
    END IF;

    IF NEW.status IN ('Resolved', 'Claim Rejected') THEN
        IF NOT user_has_role(NEW.resolved_by, 'warehouse_manager') THEN
            RAISE EXCEPTION 'Klaim hanya dapat ditutup oleh Warehouse Manager.';
        END IF;
        IF NEW.status = 'Resolved' AND OLD.status = 'Refund Processing' AND OLD.refund_proof_invalid THEN
            RAISE EXCEPTION 'Bukti refund ditandai tidak valid. Tunggu Supplier mengunggah ulang.';
        END IF;
        IF NEW.status = 'Claim Rejected' THEN
            NEW.resolution := 'Rejected';
        END IF;
        NEW.resolved_at := COALESCE(NEW.resolved_at, NOW());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_guard_claim_update
BEFORE UPDATE ON claims
FOR EACH ROW EXECUTE FUNCTION guard_claim_update();
