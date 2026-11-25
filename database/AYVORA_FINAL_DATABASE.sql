-- ============================================================
-- AYVORA - WAREHOUSE MANAGEMENT SYSTEM
-- AYVORA_FINAL_DATABASE.sql  (PostgreSQL 14 atau lebih baru)
--
-- CARA MENJALANKAN (pgAdmin 4):
--   1. Buat database baru, nama yang disarankan: ayvora
--   2. Klik kanan database "ayvora" -> Query Tool
--   3. Buka file ini (ikon folder) -> klik Execute (F5)
--   File ini aman dijalankan pada database KOSONG. Satu file berisi:
--   enum, tabel, constraint, function, trigger, view, index, data dummy.
--
-- EXTENSION: pgcrypto
--   Dipakai untuk gen_random_uuid() dan membuat hash bcrypt akun
--   dummy (crypt + gen_salt('bf')). Hash berformat $2a$ dan dapat
--   diverifikasi oleh bcryptjs.
--
-- AKUN DUMMY (password hanya untuk demonstrasi):
--   Admin              admin@ayvora.local     Admin123!
--   Warehouse Manager  manager@ayvora.local   Manager123!
--   Warehouse Staff    staff@ayvora.local     Staff123!
--   Warehouse Staff    sinta@ayvora.local     Staff123!
--   Supplier           andi@ecopack.local     DemoSupplier123!
--
-- ALUR BISNIS (lihat docs/architecture.md):
--   BARANG MASUK
--     PO (Pending -> Confirmed | Rejected)
--     -> Pengiriman (In Transit -> Arrived, dipicu Supplier + foto tiba)
--     -> Pemeriksaan (Awaiting Inspection -> Under Inspection
--                     -> Inspection Completed | Not Found)
--     -> Persetujuan (Awaiting Approval -> Approved | Revision Requested)
--     -> STOK BERTAMBAH sebesar jumlah baik + klaim otomatis
--        untuk barang kurang / rusak / tidak sesuai.
--   BARANG KELUAR
--     Pending Approval -> Approved (ALOKASI) -> Preparing
--     -> Shipped (STOK FISIK BERKURANG, alokasi dilepas)
--     Pending Approval -> Rejected -> Pending Approval (ajukan ulang)
--     Approved / Preparing -> Cancelled (alokasi dilepas)
--
-- ATURAN INTI (dijaga di database, bukan hanya di aplikasi):
--   * Hanya DUA kejadian yang mengubah stok fisik: persetujuan
--     pemeriksaan (tambah) dan barang keluar Shipped (kurang).
--   * Setiap perubahan stok menghasilkan baris stock_movements
--     (stok sebelum, perubahan, stok sesudah, sumber, pelaku).
--   * Barang rusak, kurang, dan salah produk tidak pernah masuk stok.
--   * Stok Tersedia = Stok Fisik - Dialokasikan. Persetujuan barang
--     keluar tidak boleh melebihi Stok Tersedia.
--   * Semua perubahan status dijaga trigger (urutan tidak bisa dilompati).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. ENUM
-- ============================================================

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'warehouse_manager', 'warehouse_staff', 'supplier');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE supplier_status AS ENUM ('Pending', 'Approved', 'Rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Status Purchase Order. In Transit / Arrived pindah ke pengiriman,
-- Received / Partially Received pindah ke receipt_status.
DO $$ BEGIN
    CREATE TYPE restock_status AS ENUM ('Pending', 'Confirmed', 'Rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE receipt_status AS ENUM ('Partially Received', 'Received');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Pengiriman masuk: dari PO atau barang pengganti klaim
DO $$ BEGIN
    CREATE TYPE shipment_kind AS ENUM ('PO', 'Replacement');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE inbound_status AS ENUM ('In Transit', 'Arrived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE inspection_status AS ENUM ('Awaiting Inspection', 'Under Inspection', 'Not Found', 'Inspection Completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE approval_status AS ENUM ('Awaiting Approval', 'Approved', 'Revision Requested');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE claim_type AS ENUM ('Shortage', 'Damaged', 'Wrong Item');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE claim_status AS ENUM (
        'Claim Submitted', 'Disputed', 'Replacement In Transit', 'Refund Processing', 'Resolved', 'Claim Rejected'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE outbound_status AS ENUM ('Pending Approval', 'Approved', 'Rejected', 'Preparing', 'Shipped', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE movement_type AS ENUM ('OPENING', 'INCOMING', 'OUTGOING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
-- 2. SEQUENCE NOMOR DOKUMEN
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS seq_po_number START 1;
CREATE SEQUENCE IF NOT EXISTS seq_inbound_shipment START 1;
CREATE SEQUENCE IF NOT EXISTS seq_inspection START 1;
CREATE SEQUENCE IF NOT EXISTS seq_claim START 1;
CREATE SEQUENCE IF NOT EXISTS seq_outbound START 1;

-- Contoh hasil: PO-20261120-0001
-- Tanggal hari ini menurut zona waktu gudang (WITA). Dipakai agar nomor dokumen dan
-- tanggal order tidak salah hari walau zona waktu server database berbeda (mis. UTC).
CREATE OR REPLACE FUNCTION today_local()
RETURNS DATE AS $$
    SELECT (NOW() AT TIME ZONE 'Asia/Makassar')::date;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION doc_number(p_prefix TEXT, p_seq TEXT)
RETURNS TEXT AS $$
    SELECT p_prefix || '-' || to_char(today_local(), 'YYYYMMDD') || '-' || lpad(nextval(p_seq)::text, 4, '0');
$$ LANGUAGE sql;


-- ============================================================
-- 3. USERS
-- Admin membuat akun Manager & Staff; Supplier mendaftar sendiri.
-- is_active = FALSE: akun dinonaktifkan Admin (tidak bisa login).
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,

    role user_role NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    company_name VARCHAR(150),
    company_description TEXT,
    business_field VARCHAR(150),
    website_url TEXT,

    phone VARCHAR(25),
    address TEXT,
    avatar_url TEXT,

    supplier_status supplier_status,
    supplier_review_note TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_user_supplier_status CHECK (
        (role = 'supplier' AND supplier_status IS NOT NULL)
        OR (role <> 'supplier' AND supplier_status IS NULL)
    ),
    CONSTRAINT chk_supplier_company CHECK (
        role <> 'supplier' OR (company_name IS NOT NULL AND TRIM(company_name) <> '')
    ),
    CONSTRAINT chk_supplier_rejection_note CHECK (
        supplier_status IS DISTINCT FROM 'Rejected'
        OR (supplier_review_note IS NOT NULL AND TRIM(supplier_review_note) <> '')
    )
);


-- ============================================================
-- 4. SESSIONS (hanya HASH token yang disimpan)
-- ============================================================

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 5. CATEGORIES
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 6. RACKS
-- ============================================================

CREATE TABLE IF NOT EXISTS racks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rack_code VARCHAR(20) UNIQUE NOT NULL,
    area VARCHAR(10) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_rack_area CHECK (area IN ('A', 'B', 'C', 'D', 'E'))
);


-- ============================================================
-- 7. PRODUCTS
-- Jumlah stok TIDAK disimpan di sini. Stok aktual = jumlah
-- product_locations (lihat view v_product_stock).
-- is_active = FALSE: produk diarsipkan (punya riwayat transaksi
-- sehingga tidak bisa dihapus permanen).
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    sku VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    description TEXT,

    buy_price NUMERIC(12,2) NOT NULL CHECK (buy_price >= 0),
    sell_price NUMERIC(12,2) NOT NULL CHECK (sell_price >= 0),

    -- Stok <= min_stock  -> Severe
    -- Stok <= low_stock  -> Low
    min_stock INTEGER NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
    low_stock INTEGER NOT NULL DEFAULT 1 CHECK (low_stock > 0),

    unit VARCHAR(20) NOT NULL,
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_product_stock_threshold CHECK (low_stock > min_stock)
);


-- ============================================================
-- 8. PRODUCT LOCATIONS
-- Stok produk pada setiap rak. quantity >= 0 menjamin stok
-- tidak pernah negatif.
-- ============================================================

CREATE TABLE IF NOT EXISTS product_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    rack_id UUID NOT NULL REFERENCES racks(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (product_id, rack_id)
);


-- ============================================================
-- 9. SUPPLIER CATEGORIES
-- Kategori yang dapat disediakan oleh Supplier
-- ============================================================

CREATE TABLE IF NOT EXISTS supplier_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    UNIQUE (supplier_id, category_id)
);




-- ============================================================
-- 10. RESTOCK ORDERS (Purchase Order)
-- status          : Pending -> Confirmed | Rejected (status akhir)
-- receipt_status  : diisi SISTEM setelah pemeriksaan disetujui
--                   (Partially Received / Received)
-- Info pengiriman, kedatangan, dan pemeriksaan ada di tabel
-- inbound_shipments & inspections (status tidak saling menimpa).
-- ============================================================

CREATE TABLE IF NOT EXISTS restock_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    po_number VARCHAR(50) UNIQUE NOT NULL DEFAULT doc_number('PO', 'seq_po_number'),

    supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    order_date DATE NOT NULL DEFAULT today_local(),
    expected_delivery_date DATE NOT NULL,
    notes TEXT,

    status restock_status NOT NULL DEFAULT 'Pending',
    status_reason TEXT,
    responded_at TIMESTAMPTZ,

    receipt_status receipt_status,
    received_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_restock_delivery_date CHECK (expected_delivery_date >= order_date),
    CONSTRAINT chk_restock_rejection CHECK (
        status <> 'Rejected' OR (status_reason IS NOT NULL AND TRIM(status_reason) <> '')
    ),
    CONSTRAINT chk_restock_receipt CHECK (receipt_status IS NULL OR status = 'Confirmed')
);

-- Harga satuan diisi dari harga beli produk dan boleh diubah Manager per PO.
-- Subtotal dihitung database (bukan input).
CREATE TABLE IF NOT EXISTS restock_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restock_order_id UUID NOT NULL REFERENCES restock_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    subtotal NUMERIC(16,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    UNIQUE (restock_order_id, product_id)
);

-- Rating & feedback supplier (sekali per PO, setelah barang diterima)
CREATE TABLE IF NOT EXISTS restock_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restock_order_id UUID UNIQUE NOT NULL REFERENCES restock_orders(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rated_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    feedback TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 11. CLAIMS (barang bermasalah dari pemeriksaan)
-- Dibuat OTOMATIS oleh sistem saat pemeriksaan disetujui, satu
-- klaim per temuan (kurang, rusak, tidak sesuai). Terhubung ke PO
-- dan laporan pemeriksaan asli.
-- Manager memilih penyelesaian (requested_resolution) saat status
-- masih Claim Submitted: Replacement (barang pengganti) atau Refund.
--   Claim Submitted -> Replacement In Transit -> Resolved
--                                             -> Claim Submitted (sisa, Manager memilih lagi)
--   Claim Submitted -> Refund Processing -> Resolved
--   Claim Submitted -> Disputed -> Claim Rejected | Claim Submitted
-- ============================================================

CREATE TABLE IF NOT EXISTS claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_number VARCHAR(50) UNIQUE NOT NULL DEFAULT doc_number('CLM', 'seq_claim'),

    restock_order_id UUID NOT NULL REFERENCES restock_orders(id) ON DELETE RESTRICT,
    inspection_id UUID NOT NULL,      -- FK ditambahkan setelah tabel inspections
    supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    claim_type claim_type NOT NULL,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,   -- produk yang seharusnya diterima
    actual_product_id UUID REFERENCES products(id) ON DELETE RESTRICT,    -- khusus Wrong Item
    actual_description TEXT,

    quantity INTEGER NOT NULL CHECK (quantity > 0),
    resolved_quantity INTEGER NOT NULL DEFAULT 0,
    staff_note TEXT,
    photo_url TEXT,

    status claim_status NOT NULL DEFAULT 'Claim Submitted',
    resolution VARCHAR(20),           -- Replacement | Refund | Rejected (hasil akhir)

    -- Permintaan penyelesaian dari Manager (Replacement | Refund).
    -- Supplier hanya boleh menjalankan penyelesaian yang diminta Manager.
    requested_resolution VARCHAR(20),
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    requested_at TIMESTAMPTZ,
    request_note TEXT,

    -- Sanggahan supplier
    dispute_reason TEXT,
    dispute_photo_url TEXT,
    disputed_at TIMESTAMPTZ,
    dispute_decision_note TEXT,

    -- Refund
    refund_amount NUMERIC(14,2),
    refund_reference VARCHAR(150),
    refund_proof_url TEXT,
    refund_submitted_at TIMESTAMPTZ,
    refund_proof_invalid BOOLEAN NOT NULL DEFAULT FALSE,
    refund_rejection_reason TEXT,

    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    resolution_note TEXT,

    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_claim_resolved_qty CHECK (resolved_quantity BETWEEN 0 AND quantity),
    CONSTRAINT chk_claim_wrong_item CHECK (
        claim_type <> 'Wrong Item'
        OR actual_product_id IS NOT NULL
        OR (actual_description IS NOT NULL AND TRIM(actual_description) <> '')
    ),
    CONSTRAINT chk_claim_dispute CHECK (
        status <> 'Disputed' OR (dispute_reason IS NOT NULL AND TRIM(dispute_reason) <> '')
    ),
    CONSTRAINT chk_claim_refund CHECK (
        status <> 'Refund Processing'
        OR (refund_amount IS NOT NULL AND refund_amount > 0 AND refund_proof_url IS NOT NULL)
    ),
    CONSTRAINT chk_claim_closed CHECK (
        status NOT IN ('Resolved', 'Claim Rejected') OR (resolved_at IS NOT NULL AND resolution IS NOT NULL)
    )
);

-- Database lama: tambahkan kolom permintaan Manager (aman dijalankan berulang)
ALTER TABLE claims ADD COLUMN IF NOT EXISTS requested_resolution VARCHAR(20);
ALTER TABLE claims ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS request_note TEXT;
DO $$ BEGIN
    ALTER TABLE claims ADD CONSTRAINT chk_claim_requested
        CHECK (requested_resolution IS NULL OR requested_resolution IN ('Replacement', 'Refund'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
-- 12. INBOUND SHIPMENTS (pengiriman barang masuk)
-- Dibuat Supplier dengan tombol "Kirim Barang ke Gudang".
--   In Transit -> Arrived (Supplier mengunggah foto bukti tiba)
-- kind = PO          : pengiriman pesanan (satu per PO)
-- kind = Replacement : barang pengganti, WAJIB menunjuk klaim
--                      (bukan PO baru)
-- ============================================================

CREATE TABLE IF NOT EXISTS inbound_shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_number VARCHAR(50) UNIQUE NOT NULL DEFAULT doc_number('SHP', 'seq_inbound_shipment'),

    kind shipment_kind NOT NULL DEFAULT 'PO',
    restock_order_id UUID NOT NULL REFERENCES restock_orders(id) ON DELETE RESTRICT,
    claim_id UUID REFERENCES claims(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    status inbound_status NOT NULL DEFAULT 'In Transit',
    courier_name VARCHAR(100),
    tracking_number VARCHAR(100),
    notes TEXT,

    shipped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    shipped_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    arrival_photo_url TEXT,
    arrived_at TIMESTAMPTZ,
    arrived_by UUID REFERENCES users(id) ON DELETE RESTRICT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_shipment_kind CHECK (
        (kind = 'PO' AND claim_id IS NULL) OR (kind = 'Replacement' AND claim_id IS NOT NULL)
    ),
    CONSTRAINT chk_shipment_arrival CHECK (
        status <> 'Arrived' OR (arrival_photo_url IS NOT NULL AND arrived_at IS NOT NULL AND arrived_by IS NOT NULL)
    )
);

-- Satu PO hanya punya satu pengiriman pesanan
CREATE UNIQUE INDEX IF NOT EXISTS uq_inbound_po_shipment ON inbound_shipments(restock_order_id) WHERE kind = 'PO';

-- Isi pengiriman (diisi otomatis dari PO atau dari sisa klaim)
CREATE TABLE IF NOT EXISTS inbound_shipment_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id UUID NOT NULL REFERENCES inbound_shipments(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    UNIQUE (shipment_id, product_id)
);



-- ============================================================
-- 13. INSPECTIONS (tugas pemeriksaan barang)
-- Manager menunjuk SATU Staff untuk pengiriman yang sudah Arrived.
--   status         : Awaiting Inspection -> Under Inspection
--                    -> Inspection Completed | Not Found
--   approval_status: (kosong) -> Awaiting Approval
--                    -> Approved | Revision Requested
--   Revision Requested mengembalikan status ke Under Inspection.
-- ============================================================

CREATE TABLE IF NOT EXISTS inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_number VARCHAR(50) UNIQUE NOT NULL DEFAULT doc_number('INS', 'seq_inspection'),

    shipment_id UUID NOT NULL REFERENCES inbound_shipments(id) ON DELETE RESTRICT,
    assigned_to UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assigned_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    instruction TEXT,

    status inspection_status NOT NULL DEFAULT 'Awaiting Inspection',
    approval_status approval_status,

    started_at TIMESTAMPTZ,
    notes TEXT,
    not_found_note TEXT,
    not_found_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    submission_count INTEGER NOT NULL DEFAULT 0,
    revision_reason TEXT,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,

    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_inspection_not_found CHECK (
        status <> 'Not Found' OR (not_found_note IS NOT NULL AND TRIM(not_found_note) <> '')
    ),
    CONSTRAINT chk_inspection_approval CHECK (
        (approval_status IS NULL AND status IN ('Awaiting Inspection', 'Under Inspection', 'Not Found'))
        OR (approval_status IN ('Awaiting Approval', 'Approved') AND status = 'Inspection Completed')
        OR (approval_status = 'Revision Requested' AND status = 'Under Inspection'
            AND revision_reason IS NOT NULL AND TRIM(revision_reason) <> '')
    ),
    CONSTRAINT chk_inspection_approved_by CHECK (
        approval_status IS DISTINCT FROM 'Approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    )
);

-- Satu pengiriman hanya punya satu pemeriksaan aktif (Not Found boleh diulang)
CREATE UNIQUE INDEX IF NOT EXISTS uq_inspection_active_shipment ON inspections(shipment_id) WHERE status <> 'Not Found';

ALTER TABLE claims ADD CONSTRAINT fk_claim_inspection FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE RESTRICT;

-- Hasil pemeriksaan per produk.
--   diterima = baik + rusak ; kurang = dipesan - diterima (dihitung database)
--   Jumlah diterima tidak boleh melebihi dipesan (kelebihan dicatat di catatan).
CREATE TABLE IF NOT EXISTS inspection_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,

    ordered_qty INTEGER NOT NULL CHECK (ordered_qty > 0),
    received_qty INTEGER NOT NULL CHECK (received_qty >= 0),
    good_qty INTEGER NOT NULL CHECK (good_qty >= 0),
    damaged_qty INTEGER NOT NULL CHECK (damaged_qty >= 0),
    shortage_qty INTEGER GENERATED ALWAYS AS (ordered_qty - received_qty) STORED,

    rack_id UUID REFERENCES racks(id) ON DELETE RESTRICT,   -- rak tujuan barang baik
    note TEXT,
    photo_url TEXT,

    UNIQUE (inspection_id, product_id),
    CONSTRAINT chk_inspection_item_formula CHECK (received_qty = good_qty + damaged_qty),
    CONSTRAINT chk_inspection_item_max CHECK (received_qty <= ordered_qty),
    CONSTRAINT chk_inspection_item_rack CHECK (good_qty = 0 OR rack_id IS NOT NULL),
    CONSTRAINT chk_inspection_item_photo CHECK (damaged_qty = 0 OR photo_url IS NOT NULL),
    CONSTRAINT chk_inspection_item_note CHECK (
        (damaged_qty = 0 AND received_qty = ordered_qty) OR (note IS NOT NULL AND TRIM(note) <> '')
    )
);

-- Kondisi C: barang tidak sesuai pesanan. Produk salah TIDAK PERNAH
-- dicatat sebagai barang sesuai pesanan dan tidak masuk stok.
CREATE TABLE IF NOT EXISTS inspection_mismatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    expected_product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    actual_product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
    actual_description TEXT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    note TEXT NOT NULL CHECK (TRIM(note) <> ''),
    photo_url TEXT NOT NULL,
    CONSTRAINT chk_mismatch_actual CHECK (
        actual_product_id IS NOT NULL OR (actual_description IS NOT NULL AND TRIM(actual_description) <> '')
    ),
    CONSTRAINT chk_mismatch_different CHECK (actual_product_id IS DISTINCT FROM expected_product_id)
);


-- ============================================================
-- 14. OUTBOUND ORDERS (barang keluar ke pelanggan F&B)
--   Pending Approval -> Approved (alokasi) -> Preparing -> Shipped
--   Pending Approval -> Rejected -> Pending Approval (ajukan ulang)
--   Approved | Preparing -> Cancelled
-- ============================================================

CREATE TABLE IF NOT EXISTS outbound_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) UNIQUE NOT NULL DEFAULT doc_number('OUT', 'seq_outbound'),

    customer_name VARCHAR(150) NOT NULL CHECK (TRIM(customer_name) <> ''),
    destination_address TEXT NOT NULL CHECK (TRIM(destination_address) <> ''),
    contact_phone VARCHAR(25) NOT NULL CHECK (TRIM(contact_phone) <> ''),
    notes TEXT,

    status outbound_status NOT NULL DEFAULT 'Pending Approval',
    submission_count INTEGER NOT NULL DEFAULT 1,

    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    rejection_reason TEXT,
    decided_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    decided_at TIMESTAMPTZ,
    prepared_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    prepared_at TIMESTAMPTZ,
    shipped_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    shipped_at TIMESTAMPTZ,
    ship_note TEXT,
    cancelled_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,

    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_outbound_rejection CHECK (
        status <> 'Rejected' OR (rejection_reason IS NOT NULL AND TRIM(rejection_reason) <> '')
    ),
    CONSTRAINT chk_outbound_cancel CHECK (
        status <> 'Cancelled' OR (cancel_reason IS NOT NULL AND TRIM(cancel_reason) <> '')
    )
);

-- requested_qty: permintaan Staff
-- approved_qty : jumlah yang disetujui Manager (= dialokasikan), <= Stok Tersedia
-- rack_id      : rak asal, dipilih Staff saat menyiapkan barang
-- shipped_qty  : jumlah aktual yang dikirim (<= approved_qty)
CREATE TABLE IF NOT EXISTS outbound_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES outbound_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    requested_qty INTEGER NOT NULL CHECK (requested_qty > 0),
    approved_qty INTEGER CHECK (approved_qty IS NULL OR approved_qty BETWEEN 0 AND requested_qty),
    rack_id UUID REFERENCES racks(id) ON DELETE RESTRICT,
    shipped_qty INTEGER CHECK (shipped_qty IS NULL OR (shipped_qty >= 0 AND shipped_qty <= approved_qty)),
    UNIQUE (order_id, product_id)
);

-- Riwayat bernomor: pengajuan, penolakan, pengajuan ulang, persetujuan, dst.
CREATE TABLE IF NOT EXISTS outbound_order_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES outbound_orders(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    status outbound_status NOT NULL,
    note TEXT,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (order_id, seq)
);


-- ============================================================
-- 15. STOCK MOVEMENTS
-- Riwayat SETIAP perubahan stok fisik per rak. Selain OPENING,
-- setiap baris wajib menunjuk sumbernya: pemeriksaan (masuk) atau
-- barang keluar. created_by = penyetuju / pelaku.
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    rack_id UUID NOT NULL REFERENCES racks(id) ON DELETE RESTRICT,

    movement_type movement_type NOT NULL,
    quantity_before INTEGER NOT NULL CHECK (quantity_before >= 0),
    quantity_change INTEGER NOT NULL CHECK (quantity_change <> 0),
    quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),

    inspection_id UUID REFERENCES inspections(id) ON DELETE SET NULL,
    outbound_order_id UUID REFERENCES outbound_orders(id) ON DELETE SET NULL,
    restock_order_id UUID REFERENCES restock_orders(id) ON DELETE SET NULL,
    claim_id UUID REFERENCES claims(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_movement_math CHECK (quantity_after = quantity_before + quantity_change),
    CONSTRAINT chk_movement_reference CHECK (
        movement_type = 'OPENING'
        OR (movement_type = 'INCOMING' AND inspection_id IS NOT NULL)
        OR (movement_type = 'OUTGOING' AND outbound_order_id IS NOT NULL)
    ),
    CONSTRAINT chk_movement_direction CHECK (
        (movement_type = 'OUTGOING' AND quantity_change < 0)
        OR (movement_type IN ('OPENING', 'INCOMING') AND quantity_change > 0)
    )
);


-- ============================================================
-- 16. NOTIFICATIONS & ACTIVITY LOGS
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'info',
    entity_type VARCHAR(50),
    entity_id UUID,
    link_path TEXT,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    activity VARCHAR(100) NOT NULL,
    description TEXT,
    entity_type VARCHAR(50),
    entity_id UUID,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 17. FUNCTION & TRIGGER: UPDATED_AT
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_categories_updated BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_products_updated BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_product_locations_updated BEFORE UPDATE ON product_locations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_restock_orders_updated BEFORE UPDATE ON restock_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_inbound_shipments_updated BEFORE UPDATE ON inbound_shipments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_inspections_updated BEFORE UPDATE ON inspections FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_claims_updated BEFORE UPDATE ON claims FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_outbound_orders_updated BEFORE UPDATE ON outbound_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- 18. FUNGSI BANTU
-- ============================================================

CREATE OR REPLACE FUNCTION user_has_role(p_user UUID, p_role user_role)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (SELECT 1 FROM users WHERE id = p_user AND role = p_role AND is_active);
$$ LANGUAGE sql STABLE;

-- Jumlah yang sedang dialokasikan (barang keluar Approved / Preparing)
CREATE OR REPLACE FUNCTION allocated_stock(p_product UUID)
RETURNS BIGINT AS $$
    SELECT COALESCE(SUM(i.approved_qty), 0)::BIGINT
    FROM outbound_order_items i JOIN outbound_orders o ON o.id = i.order_id
    WHERE i.product_id = p_product AND o.status IN ('Approved', 'Preparing');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION physical_stock(p_product UUID)
RETURNS BIGINT AS $$
    SELECT COALESCE(SUM(quantity), 0)::BIGINT FROM product_locations WHERE product_id = p_product;
$$ LANGUAGE sql STABLE;

-- Menambah / mengurangi stok satu rak dan menulis stock_movements
-- dalam satu langkah (dipanggil dari trigger, jadi selalu dalam
-- transaksi yang sama dengan perubahan statusnya).
CREATE OR REPLACE FUNCTION apply_stock_change(
    p_product UUID, p_rack UUID, p_change INTEGER, p_type movement_type, p_actor UUID,
    p_inspection UUID, p_outbound UUID, p_restock UUID, p_claim UUID, p_notes TEXT
) RETURNS VOID AS $$
DECLARE
    v_before INTEGER;
BEGIN
    INSERT INTO product_locations (product_id, rack_id, quantity)
    VALUES (p_product, p_rack, 0)
    ON CONFLICT (product_id, rack_id) DO NOTHING;

    SELECT quantity INTO v_before FROM product_locations
    WHERE product_id = p_product AND rack_id = p_rack FOR UPDATE;

    IF v_before + p_change < 0 THEN
        RAISE EXCEPTION 'Stok fisik di rak tidak mencukupi (tersedia %, dibutuhkan %).', v_before, -p_change;
    END IF;

    UPDATE product_locations SET quantity = quantity + p_change
    WHERE product_id = p_product AND rack_id = p_rack;

    INSERT INTO stock_movements (product_id, rack_id, movement_type, quantity_before, quantity_change, quantity_after,
                                 inspection_id, outbound_order_id, restock_order_id, claim_id, created_by, notes)
    VALUES (p_product, p_rack, p_type, v_before, p_change, v_before + p_change,
            p_inspection, p_outbound, p_restock, p_claim, p_actor, p_notes);
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 19. VALIDASI SUPPLIER & PRODUK
-- ============================================================

CREATE OR REPLACE FUNCTION validate_supplier_category()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.supplier_id AND role = 'supplier') THEN
        RAISE EXCEPTION 'Data ini hanya dapat dihubungkan ke Supplier.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_validate_supplier_category
BEFORE INSERT OR UPDATE ON supplier_categories
FOR EACH ROW EXECUTE FUNCTION validate_supplier_category();

-- Produk tidak boleh diarsipkan selama masih ada PO berjalan,
-- alokasi barang keluar, atau klaim aktif.
CREATE OR REPLACE FUNCTION guard_product_archive()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_active AND NOT NEW.is_active THEN
        IF EXISTS (
            SELECT 1 FROM restock_order_items i JOIN restock_orders ro ON ro.id = i.restock_order_id
            WHERE i.product_id = NEW.id
              AND (ro.status = 'Pending' OR (ro.status = 'Confirmed' AND ro.receipt_status IS DISTINCT FROM 'Received'))
        ) THEN
            RAISE EXCEPTION 'Produk masih ada di PO yang berjalan dan tidak dapat diarsipkan.';
        END IF;
        IF EXISTS (
            SELECT 1 FROM outbound_order_items i JOIN outbound_orders o ON o.id = i.order_id
            WHERE i.product_id = NEW.id AND o.status IN ('Pending Approval', 'Approved', 'Preparing')
        ) THEN
            RAISE EXCEPTION 'Produk masih dialokasikan / diajukan pada barang keluar dan tidak dapat diarsipkan.';
        END IF;
        IF EXISTS (
            SELECT 1 FROM claims WHERE product_id = NEW.id AND status NOT IN ('Resolved', 'Claim Rejected')
        ) THEN
            RAISE EXCEPTION 'Produk masih memiliki klaim aktif dan tidak dapat diarsipkan.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_guard_product_archive
BEFORE UPDATE OF is_active ON products
FOR EACH ROW EXECUTE FUNCTION guard_product_archive();


-- ============================================================
-- 20. PURCHASE ORDER
-- ============================================================

CREATE OR REPLACE FUNCTION prepare_restock_order()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM users WHERE id = NEW.supplier_id AND role = 'supplier' AND supplier_status = 'Approved' AND is_active
    ) THEN
        RAISE EXCEPTION 'PO hanya dapat ditujukan kepada Supplier yang sudah Approved.';
    END IF;
    IF NOT user_has_role(NEW.created_by, 'warehouse_manager') THEN
        RAISE EXCEPTION 'PO hanya dapat dibuat oleh Warehouse Manager.';
    END IF;
    NEW.status := 'Pending';
    NEW.status_reason := NULL;
    NEW.responded_at := NULL;
    NEW.receipt_status := NULL;
    NEW.received_at := NULL;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_prepare_restock_order
BEFORE INSERT ON restock_orders
FOR EACH ROW EXECUTE FUNCTION prepare_restock_order();

-- PO hanya boleh dihapus selama masih Pending (belum direspons supplier)
CREATE OR REPLACE FUNCTION guard_restock_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status <> 'Pending' THEN
        RAISE EXCEPTION 'Hanya PO berstatus Pending yang dapat dihapus.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_guard_restock_delete
BEFORE DELETE ON restock_orders
FOR EACH ROW EXECUTE FUNCTION guard_restock_delete();

CREATE OR REPLACE FUNCTION guard_restock_update()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.supplier_id <> OLD.supplier_id OR NEW.created_by <> OLD.created_by
       OR NEW.po_number <> OLD.po_number OR NEW.order_date <> OLD.order_date THEN
        RAISE EXCEPTION 'Nomor PO, supplier, pembuat, dan tanggal order tidak dapat diubah.';
    END IF;

    IF NEW.status <> OLD.status THEN
        IF NOT (OLD.status = 'Pending' AND NEW.status IN ('Confirmed', 'Rejected')) THEN
            RAISE EXCEPTION 'Perubahan status PO dari % ke % tidak diizinkan.', OLD.status, NEW.status;
        END IF;
        NEW.responded_at := NOW();
    END IF;

    IF NEW.receipt_status IS DISTINCT FROM OLD.receipt_status THEN
        IF NOT ((OLD.receipt_status IS NULL AND NEW.receipt_status IS NOT NULL)
                OR (OLD.receipt_status = 'Partially Received' AND NEW.receipt_status = 'Received')) THEN
            RAISE EXCEPTION 'Status penerimaan PO tidak boleh berubah dari % ke %.', OLD.receipt_status, NEW.receipt_status;
        END IF;
        IF NEW.receipt_status = 'Received' THEN
            NEW.received_at := NOW();
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_guard_restock_update
BEFORE UPDATE ON restock_orders
FOR EACH ROW EXECUTE FUNCTION guard_restock_update();

-- Item PO hanya dapat diubah saat PO masih Pending
CREATE OR REPLACE FUNCTION guard_restock_item_edit()
RETURNS TRIGGER AS $$
DECLARE
    v_status restock_status;
BEGIN
    SELECT status INTO v_status FROM restock_orders
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.restock_order_id ELSE NEW.restock_order_id END;

    IF FOUND AND v_status <> 'Pending' THEN
        RAISE EXCEPTION 'Item PO hanya dapat diubah ketika PO berstatus Pending.';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_guard_restock_item_edit
BEFORE INSERT OR UPDATE OR DELETE ON restock_order_items
FOR EACH ROW EXECUTE FUNCTION guard_restock_item_edit();

-- Rating: hanya PO yang sudah diterima (sebagian / penuh), sekali per PO
CREATE OR REPLACE FUNCTION validate_restock_rating()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM restock_orders
        WHERE id = NEW.restock_order_id AND receipt_status IS NOT NULL AND supplier_id = NEW.supplier_id
    ) THEN
        RAISE EXCEPTION 'Rating hanya dapat diberikan untuk PO yang barangnya sudah diterima.';
    END IF;
    IF NOT user_has_role(NEW.rated_by, 'warehouse_manager') THEN
        RAISE EXCEPTION 'Rating hanya dapat diberikan oleh Warehouse Manager.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_validate_restock_rating
BEFORE INSERT ON restock_ratings
FOR EACH ROW EXECUTE FUNCTION validate_restock_rating();

-- Status penerimaan PO dihitung ulang setiap kali pemeriksaan
-- (PO atau barang pengganti) disetujui: Received bila jumlah baik
-- untuk semua produk sudah sama dengan jumlah pesanan.
CREATE OR REPLACE FUNCTION refresh_receipt_status(p_restock UUID)
RETURNS VOID AS $$
DECLARE
    v_complete BOOLEAN;
BEGIN
    SELECT BOOL_AND(COALESCE(g.good, 0) >= ri.quantity) INTO v_complete
    FROM restock_order_items ri
    LEFT JOIN (
        SELECT ii.product_id, SUM(ii.good_qty) AS good
        FROM inspection_items ii
        JOIN inspections ins ON ins.id = ii.inspection_id AND ins.approval_status = 'Approved'
        JOIN inbound_shipments s ON s.id = ins.shipment_id
        WHERE s.restock_order_id = p_restock
        GROUP BY ii.product_id
    ) g ON g.product_id = ri.product_id
    WHERE ri.restock_order_id = p_restock;

    UPDATE restock_orders
    SET receipt_status = CASE WHEN v_complete THEN 'Received'::receipt_status ELSE 'Partially Received'::receipt_status END
    WHERE id = p_restock
      AND receipt_status IS DISTINCT FROM CASE WHEN v_complete THEN 'Received'::receipt_status ELSE 'Partially Received'::receipt_status END
      AND receipt_status IS DISTINCT FROM 'Received';
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 21. PENGIRIMAN MASUK
-- Hanya Supplier pemilik PO. Sistem yang mencatat waktu kirim dan
-- waktu tiba; Manager/Staff tidak mengubah status ini.
-- ============================================================

CREATE OR REPLACE FUNCTION prepare_inbound_shipment()
RETURNS TRIGGER AS $$
DECLARE
    v_po restock_orders%ROWTYPE;
    v_claim claims%ROWTYPE;
BEGIN
    SELECT * INTO v_po FROM restock_orders WHERE id = NEW.restock_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PO tidak ditemukan.';
    END IF;
    IF NEW.shipped_by <> v_po.supplier_id OR NOT user_has_role(NEW.shipped_by, 'supplier') THEN
        RAISE EXCEPTION 'Pengiriman hanya dapat dibuat oleh Supplier pemilik PO.';
    END IF;
    NEW.supplier_id := v_po.supplier_id;

    IF NEW.kind = 'PO' THEN
        IF v_po.status <> 'Confirmed' THEN
            RAISE EXCEPTION 'Barang hanya dapat dikirim untuk PO berstatus Confirmed (saat ini %).', v_po.status;
        END IF;
    ELSE
        SELECT * INTO v_claim FROM claims WHERE id = NEW.claim_id FOR UPDATE;
        IF NOT FOUND OR v_claim.restock_order_id <> NEW.restock_order_id OR v_claim.supplier_id <> NEW.shipped_by THEN
            RAISE EXCEPTION 'Pengiriman pengganti harus menunjuk klaim milik Supplier pada PO yang sama.';
        END IF;
        IF v_claim.status <> 'Claim Submitted' THEN
            RAISE EXCEPTION 'Barang pengganti hanya dapat dikirim untuk klaim berstatus Claim Submitted (saat ini %).', v_claim.status;
        END IF;
    END IF;

    NEW.status := 'In Transit';
    NEW.shipped_at := NOW();
    NEW.arrival_photo_url := NULL;
    NEW.arrived_at := NULL;
    NEW.arrived_by := NULL;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_prepare_inbound_shipment
BEFORE INSERT ON inbound_shipments
FOR EACH ROW EXECUTE FUNCTION prepare_inbound_shipment();

-- Isi pengiriman otomatis: semua item PO, atau sisa jumlah klaim.
CREATE OR REPLACE FUNCTION fill_inbound_shipment()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.kind = 'PO' THEN
        INSERT INTO inbound_shipment_items (shipment_id, product_id, quantity)
        SELECT NEW.id, product_id, quantity FROM restock_order_items WHERE restock_order_id = NEW.restock_order_id;
    ELSE
        INSERT INTO inbound_shipment_items (shipment_id, product_id, quantity)
        SELECT NEW.id, product_id, quantity - resolved_quantity FROM claims WHERE id = NEW.claim_id;

        UPDATE claims SET status = 'Replacement In Transit', resolution = 'Replacement', updated_by = NEW.shipped_by
        WHERE id = NEW.claim_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_fill_inbound_shipment
AFTER INSERT ON inbound_shipments
FOR EACH ROW EXECUTE FUNCTION fill_inbound_shipment();

CREATE OR REPLACE FUNCTION guard_inbound_shipment_update()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.kind <> OLD.kind OR NEW.restock_order_id <> OLD.restock_order_id
       OR NEW.claim_id IS DISTINCT FROM OLD.claim_id OR NEW.supplier_id <> OLD.supplier_id
       OR NEW.shipped_at <> OLD.shipped_at OR NEW.shipped_by <> OLD.shipped_by THEN
        RAISE EXCEPTION 'Data pengiriman tidak dapat diubah.';
    END IF;

    IF NEW.status <> OLD.status THEN
        IF NOT (OLD.status = 'In Transit' AND NEW.status = 'Arrived') THEN
            RAISE EXCEPTION 'Perubahan status pengiriman dari % ke % tidak diizinkan.', OLD.status, NEW.status;
        END IF;
        IF NEW.arrival_photo_url IS NULL OR TRIM(NEW.arrival_photo_url) = '' THEN
            RAISE EXCEPTION 'Foto bukti barang tiba wajib diunggah.';
        END IF;
        IF NEW.arrived_by IS DISTINCT FROM OLD.supplier_id THEN
            RAISE EXCEPTION 'Foto bukti tiba hanya dapat diunggah Supplier pemilik pengiriman.';
        END IF;
        NEW.arrived_at := NOW();
    ELSIF OLD.status = 'Arrived' AND (
        NEW.arrival_photo_url IS DISTINCT FROM OLD.arrival_photo_url OR NEW.arrived_at IS DISTINCT FROM OLD.arrived_at
    ) THEN
        RAISE EXCEPTION 'Bukti kedatangan sudah tercatat dan tidak dapat diubah.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_guard_inbound_shipment_update
BEFORE UPDATE ON inbound_shipments
FOR EACH ROW EXECUTE FUNCTION guard_inbound_shipment_update();


-- ============================================================
-- 22. PEMERIKSAAN & PERSETUJUAN (INTI BARANG MASUK)
-- ============================================================

CREATE OR REPLACE FUNCTION prepare_inspection()
RETURNS TRIGGER AS $$
DECLARE
    v_status inbound_status;
BEGIN
    SELECT status INTO v_status FROM inbound_shipments WHERE id = NEW.shipment_id FOR UPDATE;
    IF v_status IS DISTINCT FROM 'Arrived' THEN
        RAISE EXCEPTION 'Pemeriksaan hanya dapat diperintahkan untuk pengiriman yang sudah Arrived.';
    END IF;
    IF NOT user_has_role(NEW.assigned_by, 'warehouse_manager') THEN
        RAISE EXCEPTION 'Pemeriksaan hanya dapat diperintahkan oleh Warehouse Manager.';
    END IF;
    IF NOT user_has_role(NEW.assigned_to, 'warehouse_staff') THEN
        RAISE EXCEPTION 'Pemeriksaan harus ditugaskan kepada Staff Gudang yang aktif.';
    END IF;
    NEW.status := 'Awaiting Inspection';
    NEW.approval_status := NULL;
    NEW.started_at := NULL;
    NEW.submitted_at := NULL;
    NEW.submission_count := 0;
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_prepare_inspection
BEFORE INSERT ON inspections
FOR EACH ROW EXECUTE FUNCTION prepare_inspection();

CREATE OR REPLACE FUNCTION guard_inspection_update()
RETURNS TRIGGER AS $$
DECLARE
    v_missing INTEGER;
    v_bad TEXT;
BEGIN
    IF NEW.shipment_id <> OLD.shipment_id OR NEW.inspection_number <> OLD.inspection_number THEN
        RAISE EXCEPTION 'Pengiriman dan nomor pemeriksaan tidak dapat diubah.';
    END IF;

    -- Manager mengganti Staff yang ditunjuk
    IF NEW.assigned_to <> OLD.assigned_to THEN
        IF OLD.status NOT IN ('Awaiting Inspection', 'Under Inspection') THEN
            RAISE EXCEPTION 'Staff hanya dapat diganti sebelum laporan pemeriksaan dikirim.';
        END IF;
        IF NOT user_has_role(NEW.assigned_to, 'warehouse_staff') THEN
            RAISE EXCEPTION 'Pemeriksaan harus ditugaskan kepada Staff Gudang yang aktif.';
        END IF;
    END IF;

    -- Persetujuan Manager
    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
       AND OLD.approval_status = 'Awaiting Approval' THEN
        IF NEW.approval_status = 'Approved' THEN
            IF NOT user_has_role(NEW.approved_by, 'warehouse_manager') THEN
                RAISE EXCEPTION 'Persetujuan pemeriksaan hanya dapat dilakukan Warehouse Manager.';
            END IF;
            NEW.approved_at := NOW();
            RETURN NEW;
        ELSIF NEW.approval_status = 'Revision Requested' THEN
            IF NEW.revision_reason IS NULL OR TRIM(NEW.revision_reason) = '' THEN
                RAISE EXCEPTION 'Alasan revisi wajib diisi.';
            END IF;
            NEW.status := 'Under Inspection';
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Perubahan persetujuan tidak diizinkan.';
    END IF;

    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
       AND NOT (NEW.status = 'Inspection Completed' AND OLD.status = 'Under Inspection') THEN
        RAISE EXCEPTION 'Status persetujuan tidak boleh berubah dari % ke %.', OLD.approval_status, NEW.approval_status;
    END IF;

    IF NEW.status = OLD.status THEN
        IF OLD.approval_status = 'Approved' AND (
            NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.notes IS DISTINCT FROM OLD.notes
        ) THEN
            RAISE EXCEPTION 'Pemeriksaan yang sudah disetujui tidak dapat diubah.';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status = 'Awaiting Inspection' AND NEW.status = 'Under Inspection' THEN
        NEW.started_at := NOW();
        RETURN NEW;
    END IF;

    IF OLD.status = 'Under Inspection' AND NEW.status = 'Not Found' THEN
        IF OLD.approval_status IS NOT NULL THEN
            RAISE EXCEPTION 'Pemeriksaan yang sedang direvisi tidak dapat dilaporkan Tidak Ditemukan.';
        END IF;
        IF NEW.not_found_note IS NULL OR TRIM(NEW.not_found_note) = '' THEN
            RAISE EXCEPTION 'Catatan wajib diisi saat melaporkan barang tidak ditemukan.';
        END IF;
        NEW.not_found_at := NOW();
        RETURN NEW;
    END IF;

    IF OLD.status = 'Under Inspection' AND NEW.status = 'Inspection Completed' THEN
        -- Semua produk dalam pengiriman wajib diperiksa
        SELECT COUNT(*) INTO v_missing
        FROM inbound_shipment_items si
        WHERE si.shipment_id = NEW.shipment_id
          AND NOT EXISTS (SELECT 1 FROM inspection_items ii WHERE ii.inspection_id = NEW.id AND ii.product_id = si.product_id);
        IF v_missing > 0 THEN
            RAISE EXCEPTION 'Hasil pemeriksaan belum lengkap: % produk belum diisi.', v_missing;
        END IF;

        -- Jumlah dipesan harus sama dengan isi pengiriman
        IF EXISTS (
            SELECT 1 FROM inspection_items ii
            JOIN inbound_shipment_items si ON si.shipment_id = NEW.shipment_id AND si.product_id = ii.product_id
            WHERE ii.inspection_id = NEW.id AND ii.ordered_qty <> si.quantity
        ) OR EXISTS (
            SELECT 1 FROM inspection_items ii WHERE ii.inspection_id = NEW.id
              AND NOT EXISTS (SELECT 1 FROM inbound_shipment_items si WHERE si.shipment_id = NEW.shipment_id AND si.product_id = ii.product_id)
        ) THEN
            RAISE EXCEPTION 'Produk atau jumlah dipesan pada laporan tidak sesuai dengan pengiriman.';
        END IF;

        -- Barang tidak sesuai: maksimal sebesar jumlah kurang produk tersebut
        SELECT p.name INTO v_bad
        FROM inspection_mismatches m
        JOIN products p ON p.id = m.expected_product_id
        LEFT JOIN inspection_items ii ON ii.inspection_id = m.inspection_id AND ii.product_id = m.expected_product_id
        WHERE m.inspection_id = NEW.id
        GROUP BY p.name, ii.shortage_qty
        HAVING ii.shortage_qty IS NULL OR SUM(m.quantity) > ii.shortage_qty
        LIMIT 1;
        IF v_bad IS NOT NULL THEN
            RAISE EXCEPTION 'Jumlah barang tidak sesuai untuk % melebihi jumlah kurang produk tersebut.', v_bad;
        END IF;

        NEW.approval_status := 'Awaiting Approval';
        NEW.submitted_at := NOW();
        NEW.submission_count := OLD.submission_count + 1;
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Perubahan status pemeriksaan dari % ke % tidak diizinkan.', OLD.status, NEW.status;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_guard_inspection_update
BEFORE UPDATE ON inspections
FOR EACH ROW EXECUTE FUNCTION guard_inspection_update();

-- Hasil pemeriksaan hanya bisa diisi saat Under Inspection
CREATE OR REPLACE FUNCTION guard_inspection_detail_edit()
RETURNS TRIGGER AS $$
DECLARE
    v_status inspection_status;
BEGIN
    SELECT status INTO v_status FROM inspections
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.inspection_id ELSE NEW.inspection_id END;
    IF FOUND AND v_status <> 'Under Inspection' THEN
        RAISE EXCEPTION 'Hasil pemeriksaan hanya dapat diisi ketika status Under Inspection.';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_guard_inspection_items
BEFORE INSERT OR UPDATE OR DELETE ON inspection_items
FOR EACH ROW EXECUTE FUNCTION guard_inspection_detail_edit();

CREATE OR REPLACE TRIGGER trg_guard_inspection_mismatches
BEFORE INSERT OR UPDATE OR DELETE ON inspection_mismatches
FOR EACH ROW EXECUTE FUNCTION guard_inspection_detail_edit();

-- PERSETUJUAN PEMERIKSAAN -> STOK BERTAMBAH (TEPAT SATU KALI)
-- Berjalan di transaksi yang sama dengan UPDATE persetujuan.
--  * Hanya jumlah BAIK yang masuk stok tersedia.
--  * Pengiriman PO: setiap temuan menjadi klaim (Claim Submitted).
--  * Pengiriman pengganti: jumlah baik mengurangi sisa klaim;
--    sisa 0 -> Resolved, masih ada sisa -> kembali Claim Submitted.
CREATE OR REPLACE FUNCTION apply_inspection_approval()
RETURNS TRIGGER AS $$
DECLARE
    v_ship inbound_shipments%ROWTYPE;
    item RECORD;
    mm RECORD;
    v_wrong INTEGER;
    v_good INTEGER;
BEGIN
    SELECT * INTO v_ship FROM inbound_shipments WHERE id = NEW.shipment_id;

    FOR item IN
        SELECT * FROM inspection_items WHERE inspection_id = NEW.id ORDER BY product_id
    LOOP
        IF item.good_qty > 0 THEN
            PERFORM apply_stock_change(item.product_id, item.rack_id, item.good_qty, 'INCOMING', NEW.approved_by,
                                       NEW.id, NULL, v_ship.restock_order_id, v_ship.claim_id,
                                       CASE WHEN v_ship.kind = 'PO' THEN 'Barang masuk ' ELSE 'Barang pengganti ' END || v_ship.shipment_number);
        END IF;

        IF v_ship.kind = 'PO' THEN
            SELECT COALESCE(SUM(quantity), 0) INTO v_wrong
            FROM inspection_mismatches WHERE inspection_id = NEW.id AND expected_product_id = item.product_id;

            IF item.shortage_qty - v_wrong > 0 THEN
                INSERT INTO claims (restock_order_id, inspection_id, supplier_id, claim_type, product_id, quantity, staff_note, photo_url, updated_by)
                VALUES (v_ship.restock_order_id, NEW.id, v_ship.supplier_id, 'Shortage', item.product_id,
                        item.shortage_qty - v_wrong, item.note, item.photo_url, NEW.approved_by);
            END IF;
            IF item.damaged_qty > 0 THEN
                INSERT INTO claims (restock_order_id, inspection_id, supplier_id, claim_type, product_id, quantity, staff_note, photo_url, updated_by)
                VALUES (v_ship.restock_order_id, NEW.id, v_ship.supplier_id, 'Damaged', item.product_id,
                        item.damaged_qty, item.note, item.photo_url, NEW.approved_by);
            END IF;
        END IF;
    END LOOP;

    IF v_ship.kind = 'PO' THEN
        FOR mm IN SELECT * FROM inspection_mismatches WHERE inspection_id = NEW.id ORDER BY expected_product_id LOOP
            INSERT INTO claims (restock_order_id, inspection_id, supplier_id, claim_type, product_id, actual_product_id,
                                actual_description, quantity, staff_note, photo_url, updated_by)
            VALUES (v_ship.restock_order_id, NEW.id, v_ship.supplier_id, 'Wrong Item', mm.expected_product_id, mm.actual_product_id,
                    mm.actual_description, mm.quantity, mm.note, mm.photo_url, NEW.approved_by);
        END LOOP;
    ELSE
        SELECT COALESCE(SUM(ii.good_qty), 0) INTO v_good
        FROM inspection_items ii JOIN claims c ON c.id = v_ship.claim_id AND c.product_id = ii.product_id
        WHERE ii.inspection_id = NEW.id;

        UPDATE claims
        SET resolved_quantity = LEAST(quantity, resolved_quantity + v_good),
            status = CASE WHEN resolved_quantity + v_good >= quantity THEN 'Resolved'::claim_status ELSE 'Claim Submitted'::claim_status END,
            resolution = CASE WHEN resolved_quantity + v_good >= quantity THEN 'Replacement' ELSE NULL END,
            resolved_by = CASE WHEN resolved_quantity + v_good >= quantity THEN NEW.approved_by END,
            resolved_at = CASE WHEN resolved_quantity + v_good >= quantity THEN NOW() END,
            resolution_note = CASE WHEN resolved_quantity + v_good >= quantity
                                   THEN 'Barang pengganti diterima baik (' || v_ship.shipment_number || ').'
                                   ELSE 'Pengganti ' || v_ship.shipment_number || ' diterima baik ' || v_good || ', sisa '
                                        || (quantity - resolved_quantity - v_good) || ' menunggu penyelesaian.' END,
            updated_by = NEW.approved_by
        WHERE id = v_ship.claim_id;
    END IF;

    PERFORM refresh_receipt_status(v_ship.restock_order_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_apply_inspection_approval
AFTER UPDATE OF approval_status ON inspections
FOR EACH ROW
WHEN (OLD.approval_status = 'Awaiting Approval' AND NEW.approval_status = 'Approved')
EXECUTE FUNCTION apply_inspection_approval();


-- ============================================================
-- 23. KLAIM: ALUR STATUS
-- ============================================================

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


-- ============================================================
-- 24. BARANG KELUAR: ALOKASI & PENGURANGAN STOK
-- ============================================================

CREATE OR REPLACE FUNCTION prepare_outbound_order()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT user_has_role(NEW.created_by, 'warehouse_staff') THEN
        RAISE EXCEPTION 'Laporan barang keluar hanya dapat dibuat oleh Staff Gudang.';
    END IF;
    NEW.status := 'Pending Approval';
    NEW.submission_count := 1;
    NEW.rejection_reason := NULL;
    NEW.decided_by := NULL; NEW.decided_at := NULL;
    NEW.prepared_by := NULL; NEW.prepared_at := NULL;
    NEW.shipped_by := NULL; NEW.shipped_at := NULL;
    NEW.cancelled_by := NULL; NEW.cancelled_at := NULL;
    NEW.updated_by := NEW.created_by;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_prepare_outbound_order
BEFORE INSERT ON outbound_orders
FOR EACH ROW EXECUTE FUNCTION prepare_outbound_order();

-- Item: permintaan diubah saat Pending Approval / Rejected,
-- jumlah disetujui saat Pending Approval, rak & jumlah kirim saat Preparing.
CREATE OR REPLACE FUNCTION guard_outbound_item_edit()
RETURNS TRIGGER AS $$
DECLARE
    v_status outbound_status;
BEGIN
    SELECT status INTO v_status FROM outbound_orders
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.order_id ELSE NEW.order_id END;
    IF NOT FOUND THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    IF TG_OP IN ('INSERT', 'DELETE') THEN
        IF v_status NOT IN ('Pending Approval', 'Rejected') THEN
            RAISE EXCEPTION 'Produk hanya dapat diubah saat laporan Pending Approval atau Rejected.';
        END IF;
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    IF NEW.product_id <> OLD.product_id THEN
        RAISE EXCEPTION 'Produk pada baris tidak dapat diganti.';
    END IF;
    IF NEW.requested_qty <> OLD.requested_qty AND v_status NOT IN ('Pending Approval', 'Rejected') THEN
        RAISE EXCEPTION 'Jumlah permintaan hanya dapat diubah saat Pending Approval atau Rejected.';
    END IF;
    IF NEW.approved_qty IS DISTINCT FROM OLD.approved_qty AND v_status NOT IN ('Pending Approval', 'Rejected') THEN
        RAISE EXCEPTION 'Jumlah disetujui tidak dapat diubah setelah persetujuan.';
    END IF;
    IF (NEW.rack_id IS DISTINCT FROM OLD.rack_id OR NEW.shipped_qty IS DISTINCT FROM OLD.shipped_qty)
       AND v_status <> 'Preparing' THEN
        RAISE EXCEPTION 'Rak asal dan jumlah kirim hanya dapat diisi saat status Preparing.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_guard_outbound_item_edit
BEFORE INSERT OR UPDATE OR DELETE ON outbound_order_items
FOR EACH ROW EXECUTE FUNCTION guard_outbound_item_edit();

-- Barang keluar hanya boleh dihapus selama Pending Approval (belum diputuskan Manager)
CREATE OR REPLACE FUNCTION guard_outbound_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status <> 'Pending Approval' THEN
        RAISE EXCEPTION 'Hanya laporan barang keluar berstatus Pending Approval yang dapat dihapus.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_guard_outbound_delete
BEFORE DELETE ON outbound_orders
FOR EACH ROW EXECUTE FUNCTION guard_outbound_delete();

CREATE OR REPLACE FUNCTION guard_outbound_update()
RETURNS TRIGGER AS $$
DECLARE
    item RECORD;
    v_available BIGINT;
    v_total INTEGER;
    v_short BOOLEAN := FALSE;
BEGIN
    IF NEW.order_number <> OLD.order_number OR NEW.created_by <> OLD.created_by THEN
        RAISE EXCEPTION 'Nomor dan pembuat laporan tidak dapat diubah.';
    END IF;

    IF NEW.status = OLD.status THEN
        IF OLD.status NOT IN ('Pending Approval', 'Rejected') AND (
            NEW.customer_name IS DISTINCT FROM OLD.customer_name OR NEW.destination_address IS DISTINCT FROM OLD.destination_address
            OR NEW.contact_phone IS DISTINCT FROM OLD.contact_phone OR NEW.notes IS DISTINCT FROM OLD.notes
        ) THEN
            RAISE EXCEPTION 'Data pelanggan hanya dapat diubah saat Pending Approval atau Rejected.';
        END IF;
        RETURN NEW;
    END IF;

    -- Manager menyetujui SATU KALI, sebesar Stok Tersedia
    IF OLD.status = 'Pending Approval' AND NEW.status = 'Approved' THEN
        IF NOT user_has_role(NEW.decided_by, 'warehouse_manager') THEN
            RAISE EXCEPTION 'Persetujuan barang keluar hanya dapat dilakukan Warehouse Manager.';
        END IF;
        v_total := 0;
        FOR item IN
            SELECT i.*, p.name FROM outbound_order_items i JOIN products p ON p.id = i.product_id
            WHERE i.order_id = NEW.id ORDER BY i.product_id
        LOOP
            -- Kunci baris produk: dua persetujuan untuk produk yang sama diproses berurutan
            PERFORM 1 FROM products WHERE id = item.product_id FOR UPDATE;
            IF item.approved_qty IS NULL THEN
                RAISE EXCEPTION 'Jumlah disetujui untuk % belum diisi.', item.name;
            END IF;
            IF item.approved_qty > 0 THEN
                v_available := physical_stock(item.product_id) - allocated_stock(item.product_id);
                IF v_available <= 0 THEN
                    RAISE EXCEPTION 'Stok gudang % kosong (Stok Tersedia 0) sehingga tidak dapat disetujui.', item.name;
                END IF;
                IF item.approved_qty > v_available THEN
                    RAISE EXCEPTION 'Jumlah disetujui untuk % melebihi Stok Tersedia (%).', item.name, v_available;
                END IF;
            END IF;
            v_total := v_total + item.approved_qty;
        END LOOP;
        IF v_total = 0 THEN
            RAISE EXCEPTION 'Minimal satu produk harus disetujui dengan jumlah lebih dari 0.';
        END IF;
        NEW.decided_at := NOW();
        NEW.rejection_reason := NULL;
        RETURN NEW;
    END IF;

    IF OLD.status = 'Pending Approval' AND NEW.status = 'Rejected' THEN
        IF NOT user_has_role(NEW.decided_by, 'warehouse_manager') THEN
            RAISE EXCEPTION 'Penolakan barang keluar hanya dapat dilakukan Warehouse Manager.';
        END IF;
        IF NEW.rejection_reason IS NULL OR TRIM(NEW.rejection_reason) = '' THEN
            RAISE EXCEPTION 'Alasan penolakan wajib diisi.';
        END IF;
        NEW.decided_at := NOW();
        RETURN NEW;
    END IF;

    -- Staff memperbaiki dan mengajukan ulang
    IF OLD.status = 'Rejected' AND NEW.status = 'Pending Approval' THEN
        IF NOT user_has_role(NEW.updated_by, 'warehouse_staff') THEN
            RAISE EXCEPTION 'Pengajuan ulang hanya dapat dilakukan Staff Gudang.';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM outbound_order_items WHERE order_id = NEW.id) THEN
            RAISE EXCEPTION 'Laporan tidak memiliki produk.';
        END IF;
        NEW.submission_count := OLD.submission_count + 1;
        NEW.decided_by := NULL;
        NEW.decided_at := NULL;
        RETURN NEW;
    END IF;

    IF OLD.status = 'Approved' AND NEW.status = 'Preparing' THEN
        IF NOT user_has_role(NEW.prepared_by, 'warehouse_staff') THEN
            RAISE EXCEPTION 'Persiapan barang hanya dapat dilakukan Staff Gudang.';
        END IF;
        NEW.prepared_at := NOW();
        RETURN NEW;
    END IF;

    -- Barang keluar dari gudang: STOK FISIK BERKURANG (satu kali), alokasi dilepas
    IF OLD.status = 'Preparing' AND NEW.status = 'Shipped' THEN
        IF NOT user_has_role(NEW.shipped_by, 'warehouse_staff') THEN
            RAISE EXCEPTION 'Pengiriman barang hanya dapat dicatat Staff Gudang.';
        END IF;
        v_total := 0;
        FOR item IN
            SELECT i.*, p.name FROM outbound_order_items i JOIN products p ON p.id = i.product_id
            WHERE i.order_id = NEW.id AND i.approved_qty > 0 ORDER BY i.product_id
        LOOP
            PERFORM 1 FROM products WHERE id = item.product_id FOR UPDATE;
            IF item.shipped_qty IS NULL THEN
                RAISE EXCEPTION 'Jumlah aktual dikirim untuk % belum diisi.', item.name;
            END IF;
            IF item.shipped_qty > item.approved_qty THEN
                RAISE EXCEPTION 'Jumlah dikirim untuk % melebihi jumlah yang dialokasikan.', item.name;
            END IF;
            IF item.shipped_qty < item.approved_qty THEN
                v_short := TRUE;
            END IF;
            IF item.shipped_qty > 0 THEN
                IF item.rack_id IS NULL THEN
                    RAISE EXCEPTION 'Rak asal untuk % belum dipilih.', item.name;
                END IF;
                PERFORM apply_stock_change(item.product_id, item.rack_id, -item.shipped_qty, 'OUTGOING', NEW.shipped_by,
                                           NULL, NEW.id, NULL, NULL, 'Barang keluar ' || NEW.order_number);
            END IF;
            v_total := v_total + item.shipped_qty;
        END LOOP;
        IF v_total = 0 THEN
            RAISE EXCEPTION 'Minimal satu produk harus dikirim.';
        END IF;
        IF v_short AND (NEW.ship_note IS NULL OR TRIM(NEW.ship_note) = '') THEN
            RAISE EXCEPTION 'Catatan wajib diisi bila jumlah dikirim kurang dari jumlah disetujui.';
        END IF;
        NEW.shipped_at := NOW();
        RETURN NEW;
    END IF;

    IF OLD.status IN ('Approved', 'Preparing') AND NEW.status = 'Cancelled' THEN
        IF NOT user_has_role(NEW.cancelled_by, 'warehouse_manager') THEN
            RAISE EXCEPTION 'Pembatalan hanya dapat dilakukan Warehouse Manager.';
        END IF;
        IF NEW.cancel_reason IS NULL OR TRIM(NEW.cancel_reason) = '' THEN
            RAISE EXCEPTION 'Alasan pembatalan wajib diisi.';
        END IF;
        NEW.cancelled_at := NOW();
        RETURN NEW;   -- alokasi otomatis lepas karena status bukan Approved/Preparing lagi
    END IF;

    RAISE EXCEPTION 'Perubahan status barang keluar dari % ke % tidak diizinkan.', OLD.status, NEW.status;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_guard_outbound_update
BEFORE UPDATE ON outbound_orders
FOR EACH ROW EXECUTE FUNCTION guard_outbound_update();

-- Riwayat bernomor setiap perubahan status
CREATE OR REPLACE FUNCTION log_outbound_event()
RETURNS TRIGGER AS $$
DECLARE
    v_note TEXT;
    v_actor UUID;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_note := 'Laporan diajukan';
        v_actor := NEW.created_by;
    ELSE
        v_note := CASE NEW.status
            WHEN 'Pending Approval' THEN 'Diajukan ulang (pengajuan ke-' || NEW.submission_count || ')'
            WHEN 'Approved' THEN 'Disetujui'
            WHEN 'Rejected' THEN 'Ditolak: ' || NEW.rejection_reason
            WHEN 'Preparing' THEN 'Barang mulai disiapkan'
            WHEN 'Shipped' THEN 'Barang telah dikirim' || COALESCE(' - ' || NULLIF(TRIM(NEW.ship_note), ''), '')
            WHEN 'Cancelled' THEN 'Dibatalkan: ' || NEW.cancel_reason
        END;
        v_actor := CASE NEW.status
            WHEN 'Approved' THEN NEW.decided_by WHEN 'Rejected' THEN NEW.decided_by
            WHEN 'Preparing' THEN NEW.prepared_by WHEN 'Shipped' THEN NEW.shipped_by
            WHEN 'Cancelled' THEN NEW.cancelled_by ELSE NEW.updated_by
        END;
    END IF;

    INSERT INTO outbound_order_events (order_id, seq, status, note, actor_id)
    VALUES (NEW.id, COALESCE((SELECT MAX(seq) FROM outbound_order_events WHERE order_id = NEW.id), 0) + 1, NEW.status, v_note, v_actor);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_log_outbound_insert
AFTER INSERT ON outbound_orders
FOR EACH ROW EXECUTE FUNCTION log_outbound_event();

CREATE OR REPLACE TRIGGER trg_log_outbound_update
AFTER UPDATE OF status ON outbound_orders
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION log_outbound_event();


-- ============================================================
-- 25. DETEKSI KETERLAMBATAN PO
-- PO Confirmed yang belum dikirim dan melewati estimasi tiba.
-- Notifikasi Manager & Supplier, maksimal satu kali per PO.
-- ============================================================

CREATE OR REPLACE FUNCTION detect_late_restocks()
RETURNS INTEGER AS $$
DECLARE
    inserted_count INTEGER;
BEGIN
    WITH late AS (
        SELECT ro.id, ro.po_number, ro.supplier_id
        FROM restock_orders ro
        WHERE ro.status = 'Confirmed' AND ro.expected_delivery_date < today_local()
          AND NOT EXISTS (SELECT 1 FROM inbound_shipments s WHERE s.restock_order_id = ro.id AND s.kind = 'PO')
    ),
    targets AS (
        SELECT l.id AS po_id, l.po_number, u.id AS user_id, (u.role = 'supplier') AS is_supplier
        FROM late l
        JOIN users u ON (u.role = 'warehouse_manager' AND u.is_active) OR u.id = l.supplier_id
    ),
    ins AS (
        INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id, link_path)
        SELECT t.user_id, 'Pengiriman terlambat',
               'PO ' || t.po_number || ' telah melewati estimasi kedatangan dan belum dikirim.',
               'restock_late', 'restock_order', t.po_id,
               CASE WHEN t.is_supplier THEN '/supplier/restock/' ELSE '/manager/restock/' END || t.po_id
        FROM targets t
        WHERE NOT EXISTS (
            SELECT 1 FROM notifications n WHERE n.user_id = t.user_id AND n.type = 'restock_late' AND n.entity_id = t.po_id
        )
        RETURNING 1
    )
    SELECT COUNT(*) INTO inserted_count FROM ins;
    RETURN inserted_count;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 26. VIEW
-- ============================================================

-- Stok produk. Label stok dihitung dari STOK TERSEDIA
-- (fisik - dialokasikan) agar peringatan restock muncul lebih awal:
--   Out of Stock : tersedia = 0
--   Severe       : tersedia <= min_stock
--   Low          : tersedia <= low_stock
--   Normal       : selain itu
CREATE OR REPLACE VIEW v_product_stock AS
WITH physical AS (
    SELECT pl.product_id, SUM(pl.quantity)::BIGINT AS qty,
           STRING_AGG(r.rack_code, ', ' ORDER BY r.rack_code) FILTER (WHERE pl.quantity > 0) AS racks_with_stock,
           STRING_AGG(r.rack_code, ', ' ORDER BY r.rack_code) AS all_racks
    FROM product_locations pl JOIN racks r ON r.id = pl.rack_id
    GROUP BY pl.product_id
),
allocated AS (
    SELECT i.product_id, SUM(i.approved_qty)::BIGINT AS qty
    FROM outbound_order_items i JOIN outbound_orders o ON o.id = i.order_id
    WHERE o.status IN ('Approved', 'Preparing')
    GROUP BY i.product_id
),
base AS (
    SELECT p.*, c.name AS category_name,
           COALESCE(ph.qty, 0) AS physical_stock,
           COALESCE(al.qty, 0) AS allocated_stock,
           GREATEST(COALESCE(ph.qty, 0) - COALESCE(al.qty, 0), 0) AS available_stock,
           COALESCE(ph.racks_with_stock, ph.all_racks) AS rack_codes
    FROM products p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN physical ph ON ph.product_id = p.id
    LEFT JOIN allocated al ON al.product_id = p.id
)
SELECT
    id AS product_id, sku, name AS product_name, description, category_id, category_name, image_url,
    buy_price, sell_price, min_stock, low_stock, unit, is_active, created_at,
    physical_stock AS current_stock,
    physical_stock, allocated_stock, available_stock,
    (physical_stock * buy_price)::NUMERIC(16,2) AS stock_value,
    rack_codes,
    CASE
        WHEN available_stock = 0 THEN 'Out of Stock'
        WHEN available_stock <= min_stock THEN 'Severe'
        WHEN available_stock <= low_stock THEN 'Low'
        ELSE 'Normal'
    END AS stock_status
FROM base;

-- Ringkasan PO + status pengiriman pesanannya
CREATE OR REPLACE VIEW v_restock_overview AS
SELECT
    ro.*,
    u.company_name AS supplier_company,
    u.full_name AS supplier_contact,
    s.id AS shipment_id,
    s.status AS shipment_status,
    (ro.status = 'Confirmed' AND s.id IS NULL AND ro.expected_delivery_date < today_local()) AS is_late,
    (SELECT COUNT(*) FROM restock_order_items i WHERE i.restock_order_id = ro.id)::INTEGER AS item_count,
    (SELECT COALESCE(SUM(i.quantity), 0) FROM restock_order_items i WHERE i.restock_order_id = ro.id)::BIGINT AS total_quantity,
    (SELECT COALESCE(SUM(i.subtotal), 0) FROM restock_order_items i WHERE i.restock_order_id = ro.id)::NUMERIC(16,2) AS total_amount,
    (SELECT COUNT(*) FROM claims c WHERE c.restock_order_id = ro.id AND c.status NOT IN ('Resolved', 'Claim Rejected'))::INTEGER AS open_claims,
    rr.rating,
    rr.feedback
FROM restock_orders ro
JOIN users u ON u.id = ro.supplier_id
LEFT JOIN inbound_shipments s ON s.restock_order_id = ro.id AND s.kind = 'PO'
LEFT JOIN restock_ratings rr ON rr.restock_order_id = ro.id;


-- ============================================================
-- 27. INDEX
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_supplier_status ON users(supplier_status);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_product_locations_rack ON product_locations(rack_id);
CREATE INDEX IF NOT EXISTS idx_supplier_categories_supplier ON supplier_categories(supplier_id);
-- Nama kategori unik tanpa membedakan huruf besar/kecil
CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_name_lower ON categories (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_restock_supplier_status ON restock_orders(supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_restock_items_product ON restock_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_inbound_status ON inbound_shipments(status);
CREATE INDEX IF NOT EXISTS idx_inbound_claim ON inbound_shipments(claim_id);
CREATE INDEX IF NOT EXISTS idx_inspections_assignee ON inspections(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_inspections_approval ON inspections(approval_status);
CREATE INDEX IF NOT EXISTS idx_claims_supplier_status ON claims(supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_claims_restock ON claims(restock_order_id);
CREATE INDEX IF NOT EXISTS idx_outbound_status ON outbound_orders(status);
CREATE INDEX IF NOT EXISTS idx_outbound_items_product ON outbound_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_outbound_events_order ON outbound_order_events(order_id, seq);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_inspection ON stock_movements(inspection_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_outbound ON stock_movements(outbound_order_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);

-- ============================================================
-- 28. DATA DUMMY KATEGORI
-- ============================================================

INSERT INTO categories (name, description, image_url)
VALUES
('Paper Packaging',          'Kemasan makanan berbahan dasar kertas.',          '/images/categories/paper.svg'),
('Bagasse Packaging',        'Kemasan ramah lingkungan berbahan serat tebu.',   '/images/categories/bagasse.svg'),
('Cardboard Packaging',      'Kemasan makanan berbahan karton dan kraft.',      '/images/categories/cardboard.svg'),
('Wooden & Bamboo Supplies', 'Perlengkapan makanan berbahan kayu dan bambu.',   '/images/categories/wooden.svg'),
('Food Wrapping Supplies',   'Kertas pembungkus dan pelapis makanan.',          '/images/categories/wrapping.svg')
ON CONFLICT (name) DO NOTHING;


-- ============================================================
-- 29. DATA DUMMY RAK
-- ============================================================

INSERT INTO racks (rack_code, area, description)
VALUES
('A-01', 'A', 'Rak Paper Packaging 01'), ('A-02', 'A', 'Rak Paper Packaging 02'),
('A-03', 'A', 'Rak Paper Packaging 03'), ('A-04', 'A', 'Rak Paper Packaging 04'),
('A-05', 'A', 'Rak Paper Packaging 05'),
('B-01', 'B', 'Rak Bagasse Packaging 01'), ('B-02', 'B', 'Rak Bagasse Packaging 02'),
('B-03', 'B', 'Rak Bagasse Packaging 03'), ('B-04', 'B', 'Rak Bagasse Packaging 04'),
('B-05', 'B', 'Rak Bagasse Packaging 05'),
('C-01', 'C', 'Rak Cardboard Packaging 01'), ('C-02', 'C', 'Rak Cardboard Packaging 02'),
('C-03', 'C', 'Rak Cardboard Packaging 03'), ('C-04', 'C', 'Rak Cardboard Packaging 04'),
('C-05', 'C', 'Rak Cardboard Packaging 05'),
('D-01', 'D', 'Rak Wooden & Bamboo 01'), ('D-02', 'D', 'Rak Wooden & Bamboo 02'),
('D-03', 'D', 'Rak Wooden & Bamboo 03'), ('D-04', 'D', 'Rak Wooden & Bamboo 04'),
('D-05', 'D', 'Rak Wooden & Bamboo 05'),
('E-01', 'E', 'Rak Food Wrapping 01'), ('E-02', 'E', 'Rak Food Wrapping 02'),
('E-03', 'E', 'Rak Food Wrapping 03'), ('E-04', 'E', 'Rak Food Wrapping 04'),
('E-05', 'E', 'Rak Food Wrapping 05')
ON CONFLICT (rack_code) DO NOTHING;


-- ============================================================
-- 30. DATA DUMMY 25 PRODUK (setiap produk punya gambar sendiri)
-- ============================================================

INSERT INTO products (sku, name, category_id, description, buy_price, sell_price, min_stock, low_stock, unit, image_url)
SELECT v.sku, v.name, c.id, v.description, v.buy_price, v.sell_price, v.min_stock, v.low_stock, v.unit, v.image_url
FROM (VALUES
  -- PAPER PACKAGING
  ('AYV-PAP-001', 'Paper Cup 8 oz',  'Paper Packaging', 'Gelas kertas untuk minuman ukuran 8 oz.',   450, 650, 100, 200, 'pcs', '/images/products/paper-cup-8oz.svg'),
  ('AYV-PAP-002', 'Paper Cup 12 oz', 'Paper Packaging', 'Gelas kertas untuk minuman ukuran 12 oz.',  550, 800, 100, 200, 'pcs', '/images/products/paper-cup-12oz.svg'),
  ('AYV-PAP-003', 'Paper Cup 16 oz', 'Paper Packaging', 'Gelas kertas untuk minuman ukuran 16 oz.',  700, 950, 100, 200, 'pcs', '/images/products/paper-cup-16oz.svg'),
  ('AYV-PAP-004', 'Paper Bowl 500 ml', 'Paper Packaging', 'Mangkuk kertas kapasitas 500 ml.',        900, 1250, 80, 150, 'pcs', '/images/products/paper-bowl-500ml.svg'),
  ('AYV-PAP-005', 'Paper Bowl 750 ml', 'Paper Packaging', 'Mangkuk kertas kapasitas 750 ml.',       1100, 1500, 80, 150, 'pcs', '/images/products/paper-bowl-750ml.svg'),
  -- BAGASSE PACKAGING
  ('AYV-BAG-001', 'Bagasse Bowl 500 ml', 'Bagasse Packaging', 'Mangkuk serat tebu kapasitas 500 ml.', 1300, 1800, 50, 100, 'pcs', '/images/products/bagasse-bowl-500ml.svg'),
  ('AYV-BAG-002', 'Bagasse Bowl 750 ml', 'Bagasse Packaging', 'Mangkuk serat tebu kapasitas 750 ml.', 1600, 2200, 50, 100, 'pcs', '/images/products/bagasse-bowl-750ml.svg'),
  ('AYV-BAG-003', 'Food Container 2 Compartments', 'Bagasse Packaging', 'Wadah makanan serat tebu dengan dua sekat.',  1800, 2500, 50, 100, 'pcs', '/images/products/bagasse-container-2.svg'),
  ('AYV-BAG-004', 'Food Container 3 Compartments', 'Bagasse Packaging', 'Wadah makanan serat tebu dengan tiga sekat.', 2200, 3000, 50, 100, 'pcs', '/images/products/bagasse-container-3.svg'),
  ('AYV-BAG-005', 'Bagasse Plate 9 inch', 'Bagasse Packaging', 'Piring serat tebu ukuran 9 inch.', 1000, 1450, 50, 100, 'pcs', '/images/products/bagasse-plate-9inch.svg'),
  -- CARDBOARD PACKAGING
  ('AYV-CAR-001', 'Kraft Rice Box Small', 'Cardboard Packaging', 'Kotak nasi kraft ukuran kecil.',  700, 1000, 100, 200, 'pcs', '/images/products/kraft-rice-small.svg'),
  ('AYV-CAR-002', 'Kraft Rice Box Large', 'Cardboard Packaging', 'Kotak nasi kraft ukuran besar.',  950, 1300, 100, 200, 'pcs', '/images/products/kraft-rice-large.svg'),
  ('AYV-CAR-003', 'Burger Box',           'Cardboard Packaging', 'Kotak karton untuk kemasan burger.', 800, 1150, 80, 150, 'pcs', '/images/products/burger-box.svg'),
  ('AYV-CAR-004', 'Cake Box',             'Cardboard Packaging', 'Kotak karton untuk kemasan kue.',   1800, 2500, 50, 100, 'pcs', '/images/products/cake-box.svg'),
  ('AYV-CAR-005', 'Food Box',             'Cardboard Packaging', 'Kotak karton untuk berbagai jenis makanan.', 1200, 1700, 80, 150, 'pcs', '/images/products/food-box.svg'),
  -- WOODEN & BAMBOO SUPPLIES
  ('AYV-WOD-001', 'Wooden Spoon',          'Wooden & Bamboo Supplies', 'Sendok sekali pakai berbahan kayu.',  250, 400, 200, 400, 'pcs', '/images/products/wooden-spoon.svg'),
  ('AYV-WOD-002', 'Wooden Fork',           'Wooden & Bamboo Supplies', 'Garpu sekali pakai berbahan kayu.',   250, 400, 200, 400, 'pcs', '/images/products/wooden-fork.svg'),
  ('AYV-WOD-003', 'Bamboo Coffee Stirrer', 'Wooden & Bamboo Supplies', 'Pengaduk minuman berbahan bambu.',    150, 250, 200, 400, 'pcs', '/images/products/bamboo-stirrer.svg'),
  ('AYV-WOD-004', 'Bamboo Skewer',         'Wooden & Bamboo Supplies', 'Tusuk makanan berbahan bambu.',       200, 350, 200, 400, 'pcs', '/images/products/bamboo-skewer.svg'),
  ('AYV-WOD-005', 'Wooden Chopsticks',     'Wooden & Bamboo Supplies', 'Sumpit berbahan kayu.',               300, 500, 150, 300, 'pcs', '/images/products/wooden-chopsticks.svg'),
  -- FOOD WRAPPING SUPPLIES
  ('AYV-WRA-001', 'Kraft Food Wrapping Paper',  'Food Wrapping Supplies', 'Kertas kraft untuk membungkus makanan.',        250, 400, 100, 200, 'pcs',  '/images/products/kraft-wrapping.svg'),
  ('AYV-WRA-002', 'Greaseproof Paper',          'Food Wrapping Supplies', 'Kertas tahan minyak untuk pembungkus makanan.', 300, 500, 100, 200, 'pcs',  '/images/products/greaseproof-paper.svg'),
  ('AYV-WRA-003', 'Baking Paper Roll',          'Food Wrapping Supplies', 'Kertas baking berbentuk gulungan.',           18000, 25000, 20, 40, 'roll', '/images/products/baking-paper-roll.svg'),
  ('AYV-WRA-004', 'Food Wrapping Paper Sheet',  'Food Wrapping Supplies', 'Lembaran kertas untuk membungkus makanan.',     250, 400, 100, 200, 'pcs',  '/images/products/wrapping-sheet.svg'),
  ('AYV-WRA-005', 'Kraft Sandwich Paper',       'Food Wrapping Supplies', 'Kertas kraft khusus pembungkus sandwich.',      300, 500, 100, 200, 'pcs',  '/images/products/kraft-sandwich.svg')
) AS v(sku, name, category_name, description, buy_price, sell_price, min_stock, low_stock, unit, image_url)
JOIN categories c ON c.name = v.category_name
ON CONFLICT (sku) DO NOTHING;


-- ============================================================
-- 31. STOK AWAL (satu rak utama per kategori) + riwayat OPENING
-- Variasi status stok untuk demo: Normal, Low, Severe, Out of Stock
-- ============================================================

INSERT INTO product_locations (product_id, rack_id, quantity)
SELECT
    p.id,
    r.id,
    CASE
        WHEN p.sku = 'AYV-CAR-004' THEN 0             -- Out of Stock
        WHEN p.sku LIKE '%001' THEN 300
        WHEN p.sku LIKE '%002' THEN 250
        WHEN p.sku LIKE '%003' THEN 180
        WHEN p.sku LIKE '%004' THEN 150
        ELSE 200
    END
FROM products p
JOIN categories c ON c.id = p.category_id
JOIN racks r ON r.rack_code =
    CASE c.name
        WHEN 'Paper Packaging' THEN 'A-01'
        WHEN 'Bagasse Packaging' THEN 'B-01'
        WHEN 'Cardboard Packaging' THEN 'C-01'
        WHEN 'Wooden & Bamboo Supplies' THEN 'D-01'
        WHEN 'Food Wrapping Supplies' THEN 'E-01'
    END
ON CONFLICT (product_id, rack_id) DO NOTHING;

INSERT INTO stock_movements (product_id, rack_id, movement_type, quantity_before, quantity_change, quantity_after, notes)
SELECT pl.product_id, pl.rack_id, 'OPENING', 0, pl.quantity, pl.quantity, 'Stok awal'
FROM product_locations pl
WHERE pl.quantity > 0
  AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.product_id = pl.product_id AND sm.movement_type = 'OPENING');



-- ============================================================
-- 32. AKUN DUMMY (hash bcrypt via pgcrypto, cost 10)
-- ============================================================

INSERT INTO users (full_name, email, password_hash, role, company_name, phone, address,
                   supplier_status, company_description, business_field, website_url)
VALUES
('Admin AYVORA',  'admin@ayvora.local',   crypt('Admin123!',   gen_salt('bf', 10)), 'admin',
    NULL, '081234567810', 'Makassar, Sulawesi Selatan', NULL, NULL, NULL, NULL),
('Budi Santoso',  'manager@ayvora.local', crypt('Manager123!', gen_salt('bf', 10)), 'warehouse_manager',
    NULL, '081234567811', 'Makassar, Sulawesi Selatan', NULL, NULL, NULL, NULL),
('Rian Saputra',  'staff@ayvora.local',   crypt('Staff123!',   gen_salt('bf', 10)), 'warehouse_staff',
    NULL, '081234567812', 'Makassar, Sulawesi Selatan', NULL, NULL, NULL, NULL),
('Sinta Lestari', 'sinta@ayvora.local',   crypt('Staff123!',   gen_salt('bf', 10)), 'warehouse_staff',
    NULL, '081234567813', 'Makassar, Sulawesi Selatan', NULL, NULL, NULL, NULL),
('Andi Pratama',  'andi@ecopack.local',   crypt('DemoSupplier123!', gen_salt('bf', 10)), 'supplier',
    'PT EcoPack Nusantara', '081234567801', 'Makassar, Sulawesi Selatan', 'Approved',
    'Distributor kemasan F&B ramah lingkungan yang menyediakan produk berbahan kertas, serat tebu, dan karton.',
    'Distributor Kemasan Ramah Lingkungan', 'https://ecopack.example')
ON CONFLICT (email) DO NOTHING;

INSERT INTO supplier_categories (supplier_id, category_id)
SELECT u.id, c.id
FROM users u
CROSS JOIN categories c
WHERE u.email = 'andi@ecopack.local'
  AND c.name IN ('Paper Packaging', 'Bagasse Packaging', 'Cardboard Packaging')
ON CONFLICT (supplier_id, category_id) DO NOTHING;


-- ============================================================
-- 33. DATA DEMO ALUR OPERASIONAL
-- Dibuat lewat jalur yang sama dengan aplikasi (trigger aktif),
-- sehingga sekaligus membuktikan aturan database berjalan.
-- ============================================================

DO $$
DECLARE
    v_manager UUID; v_staff UUID; v_staff2 UUID; v_supplier UUID;
    v_po UUID; v_ship UUID; v_ins UUID; v_out UUID; v_claim UUID;
    v_rack_a1 UUID; v_rack_d1 UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM restock_orders) OR EXISTS (SELECT 1 FROM outbound_orders) THEN
        RETURN;  -- data demo sudah ada
    END IF;

    SELECT id INTO v_manager  FROM users WHERE email = 'manager@ayvora.local';
    SELECT id INTO v_staff    FROM users WHERE email = 'staff@ayvora.local';
    SELECT id INTO v_staff2   FROM users WHERE email = 'sinta@ayvora.local';
    SELECT id INTO v_supplier FROM users WHERE email = 'andi@ecopack.local';
    SELECT id INTO v_rack_a1 FROM racks WHERE rack_code = 'A-01';
    SELECT id INTO v_rack_d1 FROM racks WHERE rack_code = 'D-01';

    -- PO 1: Pending (menunggu konfirmasi supplier)
    INSERT INTO restock_orders (supplier_id, created_by, expected_delivery_date, notes)
    VALUES (v_supplier, v_manager, today_local() + 7, 'Restock gelas kertas yang hampir habis.')
    RETURNING id INTO v_po;
    INSERT INTO restock_order_items (restock_order_id, product_id, quantity, unit_price)
    SELECT v_po, id, CASE sku WHEN 'AYV-PAP-003' THEN 500 ELSE 300 END, buy_price FROM products WHERE sku IN ('AYV-PAP-003', 'AYV-PAP-002');

    -- PO 2: Confirmed + barang sedang dikirim (In Transit)
    INSERT INTO restock_orders (supplier_id, created_by, order_date, expected_delivery_date, notes)
    VALUES (v_supplier, v_manager, today_local() - 3, today_local() + 2, 'Restock mangkuk serat tebu.')
    RETURNING id INTO v_po;
    INSERT INTO restock_order_items (restock_order_id, product_id, quantity, unit_price)
    SELECT v_po, id, CASE sku WHEN 'AYV-BAG-001' THEN 400 ELSE 300 END, buy_price FROM products WHERE sku IN ('AYV-BAG-001', 'AYV-BAG-002');
    UPDATE restock_orders SET status = 'Confirmed' WHERE id = v_po;
    INSERT INTO inbound_shipments (restock_order_id, shipped_by, courier_name, tracking_number)
    VALUES (v_po, v_supplier, 'JNE Cargo', 'JNE0099887766');

    -- PO 3: Confirmed tetapi TERLAMBAT (belum dikirim, melewati estimasi)
    INSERT INTO restock_orders (supplier_id, created_by, order_date, expected_delivery_date, notes)
    VALUES (v_supplier, v_manager, today_local() - 10, today_local() - 3, 'Restock kotak nasi kraft.')
    RETURNING id INTO v_po;
    INSERT INTO restock_order_items (restock_order_id, product_id, quantity, unit_price)
    SELECT v_po, id, 400, buy_price FROM products WHERE sku = 'AYV-CAR-001';
    UPDATE restock_orders SET status = 'Confirmed' WHERE id = v_po;

    -- PO 4: barang tiba (foto Supplier), Manager menunjuk Staff -> Awaiting Inspection
    INSERT INTO restock_orders (supplier_id, created_by, order_date, expected_delivery_date, notes)
    VALUES (v_supplier, v_manager, today_local() - 6, today_local() - 1, 'Restock gelas kertas 8 oz.')
    RETURNING id INTO v_po;
    INSERT INTO restock_order_items (restock_order_id, product_id, quantity, unit_price)
    SELECT v_po, id, 400, buy_price FROM products WHERE sku = 'AYV-PAP-001';
    UPDATE restock_orders SET status = 'Confirmed' WHERE id = v_po;
    INSERT INTO inbound_shipments (restock_order_id, shipped_by, courier_name)
    VALUES (v_po, v_supplier, 'Armada sendiri') RETURNING id INTO v_ship;
    UPDATE inbound_shipments SET status = 'Arrived', arrival_photo_url = '/images/products/paper-cup-8oz.svg', arrived_by = v_supplier
    WHERE id = v_ship;
    INSERT INTO inspections (shipment_id, assigned_to, assigned_by, instruction)
    VALUES (v_ship, v_staff, v_manager, 'Periksa jumlah dan kondisi gelas, foto bila ada yang penyok.');

    -- PO 5: siklus lengkap -> pemeriksaan disetujui, stok bertambah, 3 klaim otomatis
    INSERT INTO restock_orders (supplier_id, created_by, order_date, expected_delivery_date, notes)
    VALUES (v_supplier, v_manager, today_local() - 9, today_local() - 4, 'Restock mangkuk kertas.')
    RETURNING id INTO v_po;
    INSERT INTO restock_order_items (restock_order_id, product_id, quantity, unit_price)
    SELECT v_po, id, CASE sku WHEN 'AYV-PAP-004' THEN 200 ELSE 100 END, buy_price FROM products WHERE sku IN ('AYV-PAP-004', 'AYV-PAP-005');
    UPDATE restock_orders SET status = 'Confirmed' WHERE id = v_po;
    INSERT INTO inbound_shipments (restock_order_id, shipped_by, courier_name, tracking_number)
    VALUES (v_po, v_supplier, 'SiCepat Cargo', 'SCP2026112001') RETURNING id INTO v_ship;
    UPDATE inbound_shipments SET status = 'Arrived', arrival_photo_url = '/images/products/paper-bowl-500ml.svg', arrived_by = v_supplier
    WHERE id = v_ship;
    INSERT INTO inspections (shipment_id, assigned_to, assigned_by)
    VALUES (v_ship, v_staff2, v_manager) RETURNING id INTO v_ins;
    UPDATE inspections SET status = 'Under Inspection', updated_by = v_staff2 WHERE id = v_ins;
    INSERT INTO inspection_items (inspection_id, product_id, ordered_qty, received_qty, good_qty, damaged_qty, rack_id, note, photo_url)
    SELECT v_ins, id, 200, 190, 180, 10, v_rack_a1, '10 pcs sobek, 10 pcs tidak ada di kardus.', '/images/products/paper-bowl-500ml.svg'
    FROM products WHERE sku = 'AYV-PAP-004';
    INSERT INTO inspection_items (inspection_id, product_id, ordered_qty, received_qty, good_qty, damaged_qty, rack_id, note)
    SELECT v_ins, id, 100, 95, 95, 0, v_rack_a1, '5 pcs yang datang ternyata Paper Cup 16 oz.'
    FROM products WHERE sku = 'AYV-PAP-005';
    INSERT INTO inspection_mismatches (inspection_id, expected_product_id, actual_product_id, quantity, note, photo_url)
    SELECT v_ins, e.id, a.id, 5, 'Dikirim Paper Cup 16 oz, bukan Paper Bowl 750 ml.', '/images/products/paper-cup-16oz.svg'
    FROM products e, products a WHERE e.sku = 'AYV-PAP-005' AND a.sku = 'AYV-PAP-003';
    UPDATE inspections SET status = 'Inspection Completed', notes = 'Kardus luar basah di satu sisi.', updated_by = v_staff2 WHERE id = v_ins;
    UPDATE inspections SET approval_status = 'Approved', approved_by = v_manager, updated_by = v_manager WHERE id = v_ins;

    -- Klaim rusak: Supplier memilih refund dan mengunggah bukti
    SELECT id INTO v_claim FROM claims WHERE inspection_id = v_ins AND claim_type = 'Damaged';
    UPDATE claims SET status = 'Refund Processing', refund_amount = 9000, refund_reference = 'TRF-BCA-778812',
                      refund_proof_url = '/images/products/ayvora-packaging.png', updated_by = v_supplier
    WHERE id = v_claim;

    -- Klaim kurang: Supplier mengirim barang pengganti (Replacement In Transit)
    SELECT id INTO v_claim FROM claims WHERE inspection_id = v_ins AND claim_type = 'Shortage';
    INSERT INTO inbound_shipments (kind, restock_order_id, claim_id, shipped_by, courier_name, notes)
    VALUES ('Replacement', v_po, v_claim, v_supplier, 'Armada sendiri', 'Pengganti 10 pcs yang kurang.');

    -- Barang keluar 1: Pending Approval
    INSERT INTO outbound_orders (customer_name, destination_address, contact_phone, notes, created_by)
    VALUES ('Kafe Kopi Senja', 'Jl. Penghibur No. 12, Makassar', '081355501234', 'Pesanan mingguan.', v_staff)
    RETURNING id INTO v_out;
    INSERT INTO outbound_order_items (order_id, product_id, requested_qty)
    SELECT v_out, id, CASE sku WHEN 'AYV-PAP-001' THEN 100 ELSE 50 END FROM products WHERE sku IN ('AYV-PAP-001', 'AYV-BAG-001');

    -- Barang keluar 2: Approved (stok dialokasikan, stok fisik belum berubah)
    INSERT INTO outbound_orders (customer_name, destination_address, contact_phone, notes, created_by)
    VALUES ('Resto Nusantara', 'Jl. Somba Opu No. 88, Makassar', '081355505678', 'Pesanan kemasan bagasse.', v_staff)
    RETURNING id INTO v_out;
    INSERT INTO outbound_order_items (order_id, product_id, requested_qty)
    SELECT v_out, id, 40 FROM products WHERE sku = 'AYV-BAG-002';
    UPDATE outbound_order_items SET approved_qty = requested_qty WHERE order_id = v_out;
    UPDATE outbound_orders SET status = 'Approved', decided_by = v_manager, updated_by = v_manager WHERE id = v_out;

    -- Barang keluar 3: Rejected (dengan alasan)
    INSERT INTO outbound_orders (customer_name, destination_address, contact_phone, notes, created_by)
    VALUES ('Warung Bu Sari', 'Jl. Veteran Selatan No. 5, Makassar', '081355509999', 'Permintaan dadakan.', v_staff2)
    RETURNING id INTO v_out;
    INSERT INTO outbound_order_items (order_id, product_id, requested_qty)
    SELECT v_out, id, 20 FROM products WHERE sku = 'AYV-PAP-002';
    UPDATE outbound_orders SET status = 'Rejected', decided_by = v_manager, updated_by = v_manager,
        rejection_reason = 'Alamat tujuan belum lengkap, mohon tambahkan patokan.' WHERE id = v_out;

    -- Barang keluar 4: Shipped (stok fisik berkurang tepat sekali, alokasi dilepas)
    INSERT INTO outbound_orders (customer_name, destination_address, contact_phone, created_by)
    VALUES ('Hotel Pantai Losari', 'Jl. Penghibur No. 1, Makassar', '0411888777', v_staff)
    RETURNING id INTO v_out;
    INSERT INTO outbound_order_items (order_id, product_id, requested_qty)
    SELECT v_out, id, 50 FROM products WHERE sku = 'AYV-WOD-001';
    UPDATE outbound_order_items SET approved_qty = 50 WHERE order_id = v_out;
    UPDATE outbound_orders SET status = 'Approved', decided_by = v_manager, updated_by = v_manager WHERE id = v_out;
    UPDATE outbound_orders SET status = 'Preparing', prepared_by = v_staff, updated_by = v_staff WHERE id = v_out;
    UPDATE outbound_order_items SET rack_id = v_rack_d1, shipped_qty = 50 WHERE order_id = v_out;
    UPDATE outbound_orders SET status = 'Shipped', shipped_by = v_staff, updated_by = v_staff WHERE id = v_out;

    -- Notifikasi awal
    INSERT INTO notifications (user_id, title, message, type, link_path)
    VALUES
      (v_manager, 'Laporan barang keluar menunggu persetujuan', 'Kafe Kopi Senja mengajukan barang keluar.', 'outbound', '/manager/outgoing'),
      (v_manager, 'Bukti refund diajukan', 'Supplier mengunggah bukti refund untuk klaim barang rusak.', 'claim', '/manager/claims'),
      (v_supplier, 'PO baru diterima', 'Ada PO baru yang menunggu konfirmasi Anda.', 'restock', '/supplier/restock'),
      (v_staff, 'Tugas pemeriksaan baru', 'Anda ditunjuk memeriksa barang masuk PO gelas kertas 8 oz.', 'inspection', '/staff/inspections'),
      (v_staff2, 'Barang keluar ditolak', 'Laporan untuk Warung Bu Sari ditolak. Lihat alasannya.', 'outbound', '/staff/outgoing');

    INSERT INTO activity_logs (user_id, activity, description)
    VALUES (v_manager, 'seed', 'Data demo AYVORA dibuat.');
END $$;


-- ============================================================
-- 34. CEK DATA (hasil terakhir tampil di pgAdmin)
-- ============================================================

SELECT 'users' AS tabel, COUNT(*) AS jumlah FROM users
UNION ALL SELECT 'categories', COUNT(*) FROM categories
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'racks', COUNT(*) FROM racks
UNION ALL SELECT 'restock_orders', COUNT(*) FROM restock_orders
UNION ALL SELECT 'inbound_shipments', COUNT(*) FROM inbound_shipments
UNION ALL SELECT 'inspections', COUNT(*) FROM inspections
UNION ALL SELECT 'claims', COUNT(*) FROM claims
UNION ALL SELECT 'outbound_orders', COUNT(*) FROM outbound_orders
UNION ALL SELECT 'stock_movements', COUNT(*) FROM stock_movements;

-- ============================================================
-- SELESAI DATABASE AYVORA
-- ============================================================
