CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'warehouse_manager', 'warehouse_staff', 'supplier');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE supplier_status AS ENUM ('Pending', 'Approved', 'Rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Status Purchase Order (restock)
DO $$ BEGIN
    CREATE TYPE restock_status AS ENUM ('Pending', 'Confirmed', 'Rejected', 'In Transit', 'Received');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE transaction_type AS ENUM ('INCOMING', 'OUTGOING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Status transaksi. INCOMING: Pending/Approved/Rejected.
-- OUTGOING: Pending/Approved/Rejected/Shipped.
DO $$ BEGIN
    CREATE TYPE transaction_status AS ENUM ('Pending', 'Approved', 'Rejected', 'Shipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Status pengiriman barang keluar (tabel shipments), terpisah dari status transaksi
DO $$ BEGIN
    CREATE TYPE delivery_status AS ENUM (
        'Waiting', 'Preparing', 'Ready to Ship', 'Shipped', 'Delivered', 'Delivery Issue'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE issue_type AS ENUM (
        'Lost in Transit', 'Late Delivery', 'Quantity Mismatch', 'Damaged Goods', 'Outbound Issue'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Penyelesaian masalah barang dari supplier: kirim barang pengganti atau refund
DO $$ BEGIN
    CREATE TYPE issue_remedy AS ENUM ('Replacement', 'Refund');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Requested = diminta Manager, In Progress = supplier sudah mengirim/refund, Completed = dikonfirmasi Manager
DO $$ BEGIN
    CREATE TYPE remedy_status AS ENUM ('Requested', 'In Progress', 'Completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE issue_status AS ENUM ('Open', 'Under Review', 'Resolved', 'Dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE movement_type AS ENUM ('OPENING', 'INCOMING', 'OUTGOING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- nomor dan urutan otomatis untuk PO, transaksi masuk/keluar, dan laporan masalah
CREATE SEQUENCE IF NOT EXISTS seq_po_number START 1;
CREATE SEQUENCE IF NOT EXISTS seq_trx_incoming START 1;
CREATE SEQUENCE IF NOT EXISTS seq_trx_outgoing START 1;
CREATE SEQUENCE IF NOT EXISTS seq_issue_number START 1;

-- Contoh hasil: PO-20261120-0001
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TEXT AS $$
    SELECT 'PO-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(nextval('seq_po_number')::text, 4, '0');
$$ LANGUAGE sql;


-- user_role = admin, warehouse_manager, warehouse_staff, supplier
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,

    role user_role NOT NULL,

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
    -- Penolakan supplier wajib disertai alasan
    CONSTRAINT chk_supplier_rejection_note CHECK (
        supplier_status IS DISTINCT FROM 'Rejected'
        OR (supplier_review_note IS NOT NULL AND TRIM(supplier_review_note) <> '')
    )
);


-- login session untuk user. token_hash = hash dari token yang dikirim ke client.
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- kategori produk. Satu kategori bisa punya banyak produk, tapi satu produk hanya boleh punya satu kategori.
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- rak penyimpanan produk. area = A/B/C/D/E untuk mempermudah pencarian rak.
CREATE TABLE IF NOT EXISTS racks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rack_code VARCHAR(20) UNIQUE NOT NULL,
    area VARCHAR(10) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_rack_area CHECK (area IN ('A', 'B', 'C', 'D', 'E'))
);


-- produk yang dijual. Satu produk hanya boleh punya satu kategori, tapi satu kategori bisa punya banyak produk.
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


-- lokasi produk di rak. Satu produk bisa ada di banyak rak, tapi satu rak hanya boleh punya satu baris untuk satu produk.
CREATE TABLE IF NOT EXISTS product_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    rack_id UUID NOT NULL REFERENCES racks(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (product_id, rack_id)
);


-- supplier kategori. Satu supplier bisa punya banyak kategori, tapi satu kategori hanya boleh punya satu baris untuk satu supplier.
CREATE TABLE IF NOT EXISTS supplier_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    UNIQUE (supplier_id, category_id)
);


-- PO (Purchase Order) untuk restock barang dari supplier. Satu PO bisa punya banyak item, tapi satu item hanya boleh ada satu baris untuk satu PO.
CREATE TABLE IF NOT EXISTS restock_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    po_number VARCHAR(50) UNIQUE NOT NULL DEFAULT generate_po_number(),

    supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery_date DATE NOT NULL,
    original_expected_delivery_date DATE,

    notes TEXT,

    status restock_status NOT NULL DEFAULT 'Pending',
    status_reason TEXT,

    -- Informasi pengiriman dari supplier
    shipped_date DATE,
    courier_name VARCHAR(100),
    tracking_number VARCHAR(100),
    delivery_notes TEXT,

    -- Siapa yang terakhir mengubah (dipakai trigger riwayat ETA)
    last_updated_by UUID REFERENCES users(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_restock_delivery_date CHECK (expected_delivery_date >= order_date),
    CONSTRAINT chk_restock_rejection CHECK (
        status <> 'Rejected' OR (status_reason IS NOT NULL AND TRIM(status_reason) <> '')
    )
);


-- Restock order items. Satu PO bisa punya banyak item, tapi satu item hanya boleh ada satu baris untuk satu PO.
CREATE TABLE IF NOT EXISTS restock_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restock_order_id UUID NOT NULL REFERENCES restock_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    UNIQUE (restock_order_id, product_id)
);


-- Restock delivery updates. Riwayat perubahan estimasi kedatangan PO. Satu baris = satu perubahan.
CREATE TABLE IF NOT EXISTS restock_delivery_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restock_order_id UUID NOT NULL REFERENCES restock_orders(id) ON DELETE CASCADE,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    old_expected_date DATE,
    new_expected_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Restock ratings. Satu PO hanya boleh punya satu rating dari Warehouse Manager, dan hanya untuk PO yang sudah Received.
CREATE TABLE IF NOT EXISTS restock_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restock_order_id UUID UNIQUE NOT NULL REFERENCES restock_orders(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rated_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    feedback TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Transaksi barang masuk/keluar. Satu transaksi bisa punya banyak item, tapi satu item hanya boleh ada satu baris untuk satu transaksi.
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Diisi otomatis oleh trigger (TRX-IN-... / TRX-OUT-...)
    transaction_number VARCHAR(50) UNIQUE NOT NULL,

    type transaction_type NOT NULL,
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,

    restock_order_id UUID REFERENCES restock_orders(id) ON DELETE RESTRICT,
    supplier_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    customer_name VARCHAR(150),

    notes TEXT,

    status transaction_status NOT NULL DEFAULT 'Pending',
    rejection_reason TEXT,

    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    -- Pemeriksa (Warehouse Manager) dan waktu keputusan
    reviewed_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    reviewed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_transaction_parties CHECK (
        (type = 'INCOMING' AND supplier_id IS NOT NULL AND customer_name IS NULL)
        OR
        (type = 'OUTGOING' AND customer_name IS NOT NULL AND TRIM(customer_name) <> ''
         AND supplier_id IS NULL AND restock_order_id IS NULL)
    ),
    CONSTRAINT chk_transaction_rejection CHECK (
        status <> 'Rejected' OR (rejection_reason IS NOT NULL AND TRIM(rejection_reason) <> '')
    ),
    -- Status Shipped hanya untuk barang keluar
    CONSTRAINT chk_transaction_shipped_outgoing CHECK (status <> 'Shipped' OR type = 'OUTGOING')
);

-- Satu PO hanya boleh dipakai satu Incoming Transaction yang belum Rejected
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_po_active
ON transactions(restock_order_id)
WHERE restock_order_id IS NOT NULL AND status <> 'Rejected';


-- Item transaksi. Satu transaksi bisa punya banyak item, tapi satu item hanya boleh ada satu baris untuk satu transaksi.
CREATE TABLE IF NOT EXISTS transaction_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    rack_id UUID NOT NULL REFERENCES racks(id) ON DELETE RESTRICT,

    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    damaged_quantity INTEGER NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
    expected_quantity INTEGER CHECK (expected_quantity IS NULL OR expected_quantity >= 0),
    item_note TEXT,

    UNIQUE (transaction_id, product_id, rack_id),
    CONSTRAINT chk_item_has_quantity CHECK (quantity + damaged_quantity > 0)
);


-- Pengiriman barang keluar. Satu transaksi keluar hanya boleh punya satu pengiriman, dan satu pengiriman hanya boleh punya satu transaksi.
CREATE TABLE IF NOT EXISTS shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID UNIQUE NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,

    delivery_status delivery_status NOT NULL DEFAULT 'Waiting',

    actual_ship_date DATE,
    estimated_arrival_date DATE,
    courier_name VARCHAR(100),
    tracking_number VARCHAR(100),
    notes TEXT,

    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Riwayat perubahan status pengiriman (otomatis oleh trigger)
CREATE TABLE IF NOT EXISTS shipment_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    status delivery_status NOT NULL,
    notes TEXT,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- stock movements. Satu produk di satu rak bisa punya banyak pergerakan stok, tapi satu pergerakan hanya boleh ada satu baris untuk satu produk di satu rak.
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    rack_id UUID NOT NULL REFERENCES racks(id) ON DELETE RESTRICT,

    movement_type movement_type NOT NULL,
    quantity_change INTEGER NOT NULL CHECK (quantity_change <> 0),
    quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),

    transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_movement_reference CHECK (
        movement_type = 'OPENING' OR transaction_id IS NOT NULL
    ),
    CONSTRAINT chk_movement_direction CHECK (
        (movement_type = 'OUTGOING' AND quantity_change < 0)
        OR (movement_type IN ('OPENING', 'INCOMING') AND quantity_change > 0)
    )
);


-- masalah / keluhan terkait barang masuk/keluar. Satu laporan masalah bisa punya banyak item, tapi satu item hanya boleh ada satu baris untuk satu laporan masalah.
CREATE TABLE IF NOT EXISTS issue_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_number VARCHAR(50) UNIQUE NOT NULL
        DEFAULT ('ISS-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(nextval('seq_issue_number')::text, 4, '0')),

    issue_type issue_type NOT NULL,
    status issue_status NOT NULL DEFAULT 'Open',

    restock_order_id UUID REFERENCES restock_orders(id) ON DELETE SET NULL,
    transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,

    reported_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    description TEXT NOT NULL CHECK (TRIM(description) <> ''),
    evidence_url TEXT,

    -- Keputusan Warehouse Manager
    resolution_note TEXT,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,

    -- Barang pengganti / refund (hanya untuk masalah barang dari supplier)
    remedy issue_remedy,
    remedy_status remedy_status,
    remedy_supplier_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    refund_amount NUMERIC(14,2) CHECK (refund_amount IS NULL OR refund_amount > 0),
    remedy_note TEXT,            -- catatan supplier: resi / referensi refund
    remedy_eta DATE,             -- estimasi tiba barang pengganti
    remedy_responded_at TIMESTAMPTZ,
    replacement_transaction_id UUID UNIQUE REFERENCES transactions(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_issue_remedy_pair CHECK (
        (remedy IS NULL AND remedy_status IS NULL AND remedy_supplier_id IS NULL)
        OR (remedy IS NOT NULL AND remedy_status IS NOT NULL AND remedy_supplier_id IS NOT NULL)
    ),
    CONSTRAINT chk_issue_remedy_type CHECK (
        remedy IS NULL OR issue_type IN ('Lost in Transit', 'Quantity Mismatch', 'Damaged Goods')
    ),
    CONSTRAINT chk_issue_refund_amount CHECK (remedy IS DISTINCT FROM 'Refund' OR refund_amount IS NOT NULL),
    CONSTRAINT chk_issue_remedy_closing CHECK (
        (status <> 'Resolved' OR remedy IS NULL OR remedy_status = 'Completed')
        AND (status <> 'Dismissed' OR remedy IS NULL)
    ),
    CONSTRAINT chk_issue_reference CHECK (restock_order_id IS NOT NULL OR transaction_id IS NOT NULL),
    CONSTRAINT chk_issue_resolution CHECK (
        status NOT IN ('Resolved', 'Dismissed')
        OR (resolution_note IS NOT NULL AND TRIM(resolution_note) <> '' AND resolved_by IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS issue_report_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_report_id UUID NOT NULL REFERENCES issue_reports(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    UNIQUE (issue_report_id, product_id)
);


-- notifications untuk user. Satu user bisa punya banyak notifikasi, tapi satu notifikasi hanya boleh ada satu baris untuk satu user.
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


-- riwayat aktivitas user. Satu user bisa punya banyak log, tapi satu log hanya boleh ada satu baris untuk satu aktivitas.
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


-- updated_at otomatis saat ada perubahan di tabel-tabel utama
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_users_updated BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_categories_updated BEFORE UPDATE ON categories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_products_updated BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_product_locations_updated BEFORE UPDATE ON product_locations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_restock_orders_updated BEFORE UPDATE ON restock_orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_transactions_updated BEFORE UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_shipments_updated BEFORE UPDATE ON shipments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_issue_reports_updated BEFORE UPDATE ON issue_reports
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Penjaga alur barang pengganti / refund:
--  * remedy hanya boleh diminta lewat UPDATE, status awal Requested, dan tidak bisa diganti jenisnya
--  * status maju satu arah: Requested -> In Progress -> Completed
--  * barang pengganti Completed wajib terhubung ke transaksi INCOMING Approved dari supplier yang sama
CREATE OR REPLACE FUNCTION guard_issue_remedy()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.remedy IS NOT NULL THEN
            RAISE EXCEPTION 'Penyelesaian pengganti/refund hanya dapat diminta pada laporan yang sudah ada.';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.remedy IS NULL AND NEW.remedy IS NOT NULL THEN
        IF NEW.remedy_status <> 'Requested' THEN
            RAISE EXCEPTION 'Permintaan penyelesaian harus dimulai dari status Requested.';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.remedy_supplier_id AND role = 'supplier') THEN
            RAISE EXCEPTION 'Penyelesaian hanya dapat diminta kepada akun Supplier.';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.remedy IS NOT NULL THEN
        IF NEW.remedy IS DISTINCT FROM OLD.remedy OR NEW.remedy_supplier_id IS DISTINCT FROM OLD.remedy_supplier_id THEN
            RAISE EXCEPTION 'Jenis penyelesaian dan supplier tidak dapat diubah.';
        END IF;
        IF NEW.remedy_status IS DISTINCT FROM OLD.remedy_status
           AND NOT ((OLD.remedy_status = 'Requested' AND NEW.remedy_status = 'In Progress')
                 OR (OLD.remedy_status = 'In Progress' AND NEW.remedy_status = 'Completed')) THEN
            RAISE EXCEPTION 'Status penyelesaian tidak boleh berpindah dari % ke %.', OLD.remedy_status, NEW.remedy_status;
        END IF;
        IF NEW.remedy_status = 'Completed' AND NEW.remedy = 'Replacement' THEN
            IF NOT EXISTS (
                SELECT 1 FROM transactions
                WHERE id = NEW.replacement_transaction_id AND type = 'INCOMING'
                  AND status IN ('Approved') AND supplier_id = NEW.remedy_supplier_id
            ) THEN
                RAISE EXCEPTION 'Barang pengganti harus terhubung ke transaksi barang masuk Approved dari supplier yang sama.';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_guard_issue_remedy BEFORE INSERT OR UPDATE ON issue_reports
FOR EACH ROW EXECUTE FUNCTION guard_issue_remedy();


-- validasi agar hanya akun Supplier yang bisa dihubungkan ke kategori dan rating
-- PO hanya boleh ditujukan kepada Supplier yang sudah Approved
CREATE OR REPLACE FUNCTION validate_restock_supplier()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM users
        WHERE id = NEW.supplier_id AND role = 'supplier' AND supplier_status = 'Approved'
    ) THEN
        RAISE EXCEPTION 'PO hanya dapat ditujukan kepada Supplier yang sudah Approved.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM users WHERE id = NEW.created_by AND role = 'warehouse_manager'
    ) THEN
        RAISE EXCEPTION 'PO hanya dapat dibuat oleh Warehouse Manager.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_validate_restock_supplier
BEFORE INSERT ON restock_orders
FOR EACH ROW EXECUTE FUNCTION validate_restock_supplier();

-- Kategori & rating hanya untuk akun Supplier
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

CREATE OR REPLACE TRIGGER trg_validate_rating_supplier
BEFORE INSERT OR UPDATE ON restock_ratings
FOR EACH ROW EXECUTE FUNCTION validate_supplier_category();


-- restock order otomatis di-set Pending saat dibuat, dan menyimpan estimasi kedatangan awal
CREATE OR REPLACE FUNCTION prepare_restock_order()
RETURNS TRIGGER AS $$
BEGIN
    NEW.status := 'Pending';
    NEW.status_reason := NULL;
    NEW.original_expected_delivery_date := NEW.expected_delivery_date;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_prepare_restock_order
BEFORE INSERT ON restock_orders
FOR EACH ROW EXECUTE FUNCTION prepare_restock_order();

CREATE OR REPLACE FUNCTION guard_restock_update()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.supplier_id <> OLD.supplier_id OR NEW.created_by <> OLD.created_by
       OR NEW.po_number <> OLD.po_number OR NEW.order_date <> OLD.order_date THEN
        RAISE EXCEPTION 'Nomor PO, supplier, pembuat, dan tanggal order tidak dapat diubah.';
    END IF;

    IF NEW.status <> OLD.status THEN
        IF NOT (
            (OLD.status = 'Pending'    AND NEW.status IN ('Confirmed', 'Rejected')) OR
            (OLD.status = 'Confirmed'  AND NEW.status = 'In Transit') OR
            (OLD.status = 'In Transit' AND NEW.status = 'Received')
        ) THEN
            RAISE EXCEPTION 'Perubahan status PO dari % ke % tidak diizinkan.', OLD.status, NEW.status;
        END IF;
    ELSIF OLD.status IN ('Rejected', 'Received')
          AND NEW.expected_delivery_date <> OLD.expected_delivery_date THEN
        RAISE EXCEPTION 'Estimasi kedatangan PO yang sudah % tidak dapat diubah.', OLD.status;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_guard_restock_update
BEFORE UPDATE ON restock_orders
FOR EACH ROW EXECUTE FUNCTION guard_restock_update();

-- Setiap perubahan estimasi kedatangan WAJIB masuk riwayat
CREATE OR REPLACE FUNCTION log_restock_eta_change()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO restock_delivery_updates (restock_order_id, updated_by, old_expected_date, new_expected_date, notes)
    VALUES (NEW.id, NEW.last_updated_by, OLD.expected_delivery_date, NEW.expected_delivery_date, NEW.delivery_notes);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_log_restock_eta_change
AFTER UPDATE OF expected_delivery_date ON restock_orders
FOR EACH ROW
WHEN (OLD.expected_delivery_date IS DISTINCT FROM NEW.expected_delivery_date)
EXECUTE FUNCTION log_restock_eta_change();

-- Item PO hanya dapat diubah saat PO masih Pending
CREATE OR REPLACE FUNCTION guard_restock_item_edit()
RETURNS TRIGGER AS $$
DECLARE
    v_status restock_status;
    v_order_id UUID;
BEGIN
    v_order_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.restock_order_id ELSE NEW.restock_order_id END;
    SELECT status INTO v_status FROM restock_orders WHERE id = v_order_id;

    -- Induk sudah terhapus (cascade): izinkan
    IF NOT FOUND THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    IF v_status <> 'Pending' THEN
        RAISE EXCEPTION 'Item PO hanya dapat diubah ketika PO berstatus Pending.';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_guard_restock_item_edit
BEFORE INSERT OR UPDATE OR DELETE ON restock_order_items
FOR EACH ROW EXECUTE FUNCTION guard_restock_item_edit();

-- Rating hanya untuk PO yang sudah Received dan milik supplier yang sama
CREATE OR REPLACE FUNCTION validate_restock_rating()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM restock_orders
        WHERE id = NEW.restock_order_id AND status = 'Received' AND supplier_id = NEW.supplier_id
    ) THEN
        RAISE EXCEPTION 'Rating hanya dapat diberikan untuk PO berstatus Received milik supplier tersebut.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.rated_by AND role = 'warehouse_manager') THEN
        RAISE EXCEPTION 'Rating hanya dapat diberikan oleh Warehouse Manager.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_validate_restock_rating
BEFORE INSERT ON restock_ratings
FOR EACH ROW EXECUTE FUNCTION validate_restock_rating();


-- transaksi otomatis di-set Pending saat dibuat, dan nomor transaksi di-generate otomatis
CREATE OR REPLACE FUNCTION prepare_transaction()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.transaction_number IS NULL OR TRIM(NEW.transaction_number) = '' THEN
        NEW.transaction_number :=
            CASE WHEN NEW.type = 'INCOMING' THEN 'TRX-IN-' ELSE 'TRX-OUT-' END
            || to_char(CURRENT_DATE, 'YYYYMMDD') || '-'
            || lpad(nextval(CASE WHEN NEW.type = 'INCOMING' THEN 'seq_trx_incoming' ELSE 'seq_trx_outgoing' END)::text, 4, '0');
    END IF;

    -- Transaksi baru selalu Pending dan belum ada pemeriksa
    NEW.status := 'Pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;

    IF NOT EXISTS (
        SELECT 1 FROM users WHERE id = NEW.created_by AND role = 'warehouse_staff'
    ) THEN
        RAISE EXCEPTION 'Transaksi hanya dapat dibuat oleh Staff Gudang.';
    END IF;

    IF NEW.type = 'INCOMING' THEN
        IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.supplier_id AND role = 'supplier') THEN
            RAISE EXCEPTION 'Akun yang dipilih bukan Supplier.';
        END IF;

        IF NEW.restock_order_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM restock_orders
            WHERE id = NEW.restock_order_id AND status = 'Received' AND supplier_id = NEW.supplier_id
        ) THEN
            RAISE EXCEPTION 'PO harus berstatus Received dan milik supplier yang dipilih.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_prepare_transaction
BEFORE INSERT ON transactions
FOR EACH ROW EXECUTE FUNCTION prepare_transaction();


-- transaction item hanya dapat diubah saat transaksi masih Pending, dan jumlah barang keluar tidak boleh melebihi stok di rak
CREATE OR REPLACE FUNCTION validate_transaction_item()
RETURNS TRIGGER AS $$
DECLARE
    v_tx transactions%ROWTYPE;
    v_stock INTEGER;
    v_expected INTEGER;
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT * INTO v_tx FROM transactions WHERE id = OLD.transaction_id FOR UPDATE;
        IF NOT FOUND THEN
            RETURN OLD;  -- transaksi sedang dihapus (cascade)
        END IF;
        IF v_tx.status <> 'Pending' THEN
            RAISE EXCEPTION 'Item hanya dapat diubah ketika transaksi berstatus Pending.';
        END IF;
        RETURN OLD;
    END IF;

    SELECT * INTO v_tx FROM transactions WHERE id = NEW.transaction_id FOR UPDATE;
    IF v_tx.status <> 'Pending' THEN
        RAISE EXCEPTION 'Item hanya dapat diubah ketika transaksi berstatus Pending.';
    END IF;

    IF v_tx.type = 'OUTGOING' THEN
        IF NEW.quantity <= 0 OR NEW.damaged_quantity <> 0 THEN
            RAISE EXCEPTION 'Jumlah barang keluar harus lebih dari 0.';
        END IF;

        SELECT quantity INTO v_stock FROM product_locations
        WHERE product_id = NEW.product_id AND rack_id = NEW.rack_id;

        IF v_stock IS NULL OR v_stock < NEW.quantity THEN
            RAISE EXCEPTION 'Jumlah melebihi stok yang tersedia di rak tersebut.';
        END IF;
    ELSIF v_tx.restock_order_id IS NOT NULL THEN
        SELECT quantity INTO v_expected FROM restock_order_items
        WHERE restock_order_id = v_tx.restock_order_id AND product_id = NEW.product_id;

        IF v_expected IS NULL THEN
            RAISE EXCEPTION 'Produk tidak terdapat pada PO yang dipilih.';
        END IF;
        NEW.expected_quantity := v_expected;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_validate_transaction_item
BEFORE INSERT OR UPDATE OR DELETE ON transaction_items
FOR EACH ROW EXECUTE FUNCTION validate_transaction_item();

-- Hanya transaksi Pending yang boleh dihapus
CREATE OR REPLACE FUNCTION guard_transaction_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status <> 'Pending' THEN
        RAISE EXCEPTION 'Hanya transaksi berstatus Pending yang dapat dihapus.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_guard_transaction_delete
BEFORE DELETE ON transactions
FOR EACH ROW EXECUTE FUNCTION guard_transaction_delete();


-- (transactions)
-- Hanya transaksi Pending yang boleh diubah. Saat Approved, stok berubah.
-- Barang keluar yang sudah dikirim (Shipped) tidak boleh diubah.
CREATE OR REPLACE FUNCTION guard_transaction_update()
RETURNS TRIGGER AS $$
DECLARE
    item RECORD;
    current_quantity INTEGER;
    quantity_after INTEGER;
BEGIN
    IF NEW.type <> OLD.type
       OR NEW.created_by <> OLD.created_by
       OR NEW.transaction_number <> OLD.transaction_number THEN
        RAISE EXCEPTION 'Tipe, pembuat, dan nomor transaksi tidak dapat diubah.';
    END IF;

    -- Status tidak berubah: data hanya boleh diedit saat Pending
    IF OLD.status = NEW.status THEN
        IF OLD.status <> 'Pending' AND (
            NEW.restock_order_id IS DISTINCT FROM OLD.restock_order_id OR
            NEW.supplier_id IS DISTINCT FROM OLD.supplier_id OR
            NEW.customer_name IS DISTINCT FROM OLD.customer_name OR
            NEW.notes IS DISTINCT FROM OLD.notes OR
            NEW.transaction_date IS DISTINCT FROM OLD.transaction_date
        ) THEN
            RAISE EXCEPTION 'Hanya transaksi berstatus Pending yang dapat diedit.';
        END IF;
        RETURN NEW;
    END IF;

    -- Keputusan Manager
    IF OLD.status = 'Pending' AND NEW.status IN ('Approved', 'Rejected') THEN

        IF NEW.reviewed_by IS NULL OR NOT EXISTS (
            SELECT 1 FROM users WHERE id = NEW.reviewed_by AND role = 'warehouse_manager'
        ) THEN
            RAISE EXCEPTION 'Persetujuan atau penolakan harus dilakukan Warehouse Manager.';
        END IF;

        IF NEW.reviewed_by = NEW.created_by THEN
            RAISE EXCEPTION 'Pembuat transaksi tidak boleh memutuskan transaksinya sendiri.';
        END IF;

        NEW.reviewed_at := NOW();

        IF NEW.status = 'Rejected' THEN
            IF NEW.rejection_reason IS NULL OR TRIM(NEW.rejection_reason) = '' THEN
                RAISE EXCEPTION 'Alasan penolakan wajib diisi.';
            END IF;
            RETURN NEW;  -- stok tidak berubah
        END IF;

        -- Approved
        IF NOT EXISTS (SELECT 1 FROM transaction_items WHERE transaction_id = NEW.id) THEN
            RAISE EXCEPTION 'Transaksi tidak memiliki detail produk.';
        END IF;

        FOR item IN
            SELECT product_id, rack_id, quantity
            FROM transaction_items
            WHERE transaction_id = NEW.id
            ORDER BY product_id, rack_id      -- urutan tetap mencegah deadlock
        LOOP
            IF NEW.type = 'INCOMING' THEN
                -- Hanya jumlah LAYAK PAKAI yang masuk stok (barang rusak tidak)
                IF item.quantity > 0 THEN
                    INSERT INTO product_locations (product_id, rack_id, quantity)
                    VALUES (item.product_id, item.rack_id, item.quantity)
                    ON CONFLICT (product_id, rack_id)
                    DO UPDATE SET quantity = product_locations.quantity + EXCLUDED.quantity,
                                  updated_at = NOW()
                    RETURNING quantity INTO quantity_after;

                    INSERT INTO stock_movements
                        (product_id, rack_id, movement_type, quantity_change, quantity_after, transaction_id, created_by)
                    VALUES
                        (item.product_id, item.rack_id, 'INCOMING', item.quantity, quantity_after, NEW.id, NEW.reviewed_by);
                END IF;
            ELSE
                SELECT quantity INTO current_quantity
                FROM product_locations
                WHERE product_id = item.product_id AND rack_id = item.rack_id
                FOR UPDATE;

                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Lokasi stok produk tidak ditemukan.';
                END IF;
                IF current_quantity < item.quantity THEN
                    RAISE EXCEPTION 'Stok tidak mencukupi untuk produk %.', item.product_id;
                END IF;

                UPDATE product_locations
                SET quantity = quantity - item.quantity, updated_at = NOW()
                WHERE product_id = item.product_id AND rack_id = item.rack_id
                RETURNING quantity INTO quantity_after;

                INSERT INTO stock_movements
                    (product_id, rack_id, movement_type, quantity_change, quantity_after, transaction_id, created_by)
                VALUES
                    (item.product_id, item.rack_id, 'OUTGOING', -item.quantity, quantity_after, NEW.id, NEW.reviewed_by);
            END IF;
        END LOOP;

        RETURN NEW;
    END IF;

    -- Barang keluar dikirim: tidak mengubah stok
    IF OLD.status = 'Approved' AND NEW.status = 'Shipped' THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Perubahan status transaksi dari % ke % tidak diizinkan.', OLD.status, NEW.status;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_guard_transaction_update
BEFORE UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION guard_transaction_update();


-- (shipments)
-- Dibuat otomatis saat OUTGOING di-Approve. Perubahan status
-- pengiriman tercatat di shipment_updates. Saat Shipped,
-- status transaksi ikut menjadi Shipped (stok tidak berubah).
CREATE OR REPLACE FUNCTION create_shipment_on_approval()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO shipments (transaction_id) VALUES (NEW.id) ON CONFLICT (transaction_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_create_shipment_on_approval
AFTER UPDATE OF status ON transactions
FOR EACH ROW
WHEN (NEW.type = 'OUTGOING' AND OLD.status = 'Pending' AND NEW.status = 'Approved')
EXECUTE FUNCTION create_shipment_on_approval();

CREATE OR REPLACE FUNCTION guard_shipment_update()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.transaction_id <> OLD.transaction_id THEN
        RAISE EXCEPTION 'Transaksi pada pengiriman tidak dapat diubah.';
    END IF;

    IF NEW.delivery_status <> OLD.delivery_status THEN
        IF NOT (
            (OLD.delivery_status = 'Waiting'        AND NEW.delivery_status = 'Preparing') OR
            (OLD.delivery_status = 'Preparing'      AND NEW.delivery_status = 'Ready to Ship') OR
            (OLD.delivery_status = 'Ready to Ship'  AND NEW.delivery_status IN ('Shipped', 'Delivery Issue')) OR
            (OLD.delivery_status = 'Shipped'        AND NEW.delivery_status IN ('Delivered', 'Delivery Issue')) OR
            (OLD.delivery_status = 'Delivery Issue' AND NEW.delivery_status IN ('Shipped', 'Delivered'))
        ) THEN
            RAISE EXCEPTION 'Perubahan status pengiriman dari % ke % tidak diizinkan.',
                OLD.delivery_status, NEW.delivery_status;
        END IF;

        IF NEW.delivery_status = 'Shipped' AND NEW.actual_ship_date IS NULL THEN
            NEW.actual_ship_date := CURRENT_DATE;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_guard_shipment_update
BEFORE UPDATE ON shipments
FOR EACH ROW EXECUTE FUNCTION guard_shipment_update();

CREATE OR REPLACE FUNCTION log_shipment_status()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO shipment_updates (shipment_id, status, notes, updated_by)
    VALUES (NEW.id, NEW.delivery_status, NEW.notes, NEW.updated_by);

    -- Barang sudah keluar gudang: status transaksi menjadi Shipped (stok tidak berubah)
    IF NEW.delivery_status IN ('Shipped', 'Delivered') THEN
        UPDATE transactions SET status = 'Shipped'
        WHERE id = NEW.transaction_id AND status = 'Approved';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_log_shipment_insert
AFTER INSERT ON shipments
FOR EACH ROW EXECUTE FUNCTION log_shipment_status();

CREATE OR REPLACE TRIGGER trg_log_shipment_update
AFTER UPDATE OF delivery_status ON shipments
FOR EACH ROW
WHEN (OLD.delivery_status IS DISTINCT FROM NEW.delivery_status)
EXECUTE FUNCTION log_shipment_status();


-- DETEKSI KETERLAMBATAN PO
-- Dipanggil aplikasi saat dashboard dibuka. Membuat notifikasi
-- untuk Manager dan Supplier terkait, maksimal satu kali per PO.
CREATE OR REPLACE FUNCTION detect_late_restocks()
RETURNS INTEGER AS $$
DECLARE
    inserted_count INTEGER;
BEGIN
    WITH late AS (
        SELECT id, po_number, supplier_id
        FROM restock_orders
        WHERE status IN ('Confirmed', 'In Transit')
          AND expected_delivery_date < CURRENT_DATE
    ),
    targets AS (
        SELECT l.id AS po_id, l.po_number, u.id AS user_id, (u.role = 'supplier') AS is_supplier
        FROM late l
        JOIN users u ON u.role = 'warehouse_manager' OR u.id = l.supplier_id
    ),
    ins AS (
        INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id, link_path)
        SELECT t.user_id,
               'Pengiriman terlambat',
               'PO ' || t.po_number || ' telah melewati estimasi kedatangan.',
               'restock_late', 'restock_order', t.po_id,
               CASE WHEN t.is_supplier THEN '/supplier/restock/' ELSE '/manager/restock/' END || t.po_id
        FROM targets t
        WHERE NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.user_id = t.user_id AND n.type = 'restock_late' AND n.entity_id = t.po_id
        )
        RETURNING 1
    )
    SELECT COUNT(*) INTO inserted_count FROM ins;

    RETURN inserted_count;
END;
$$ LANGUAGE plpgsql;

-- 29. VIEW
-- Stok produk + status stok otomatis:
--   Out of Stock : stok = 0
--   Severe       : stok <= min_stock
--   Low          : stok <= low_stock
--   Normal       : selain itu
CREATE OR REPLACE VIEW v_product_stock AS
SELECT
    p.id AS product_id,
    p.sku,
    p.name AS product_name,
    p.description,
    p.category_id,
    c.name AS category_name,
    p.image_url,
    p.buy_price,
    p.sell_price,
    p.min_stock,
    p.low_stock,
    p.unit,
    p.is_active,
    p.created_at,
    COALESCE(SUM(pl.quantity), 0)::BIGINT AS current_stock,
    (COALESCE(SUM(pl.quantity), 0) * p.buy_price)::NUMERIC(16,2) AS stock_value,
    COALESCE(
        STRING_AGG(r.rack_code, ', ' ORDER BY r.rack_code) FILTER (WHERE pl.quantity > 0),
        STRING_AGG(r.rack_code, ', ' ORDER BY r.rack_code)
    ) AS rack_codes,
    CASE
        WHEN COALESCE(SUM(pl.quantity), 0) = 0 THEN 'Out of Stock'
        WHEN COALESCE(SUM(pl.quantity), 0) <= p.min_stock THEN 'Severe'
        WHEN COALESCE(SUM(pl.quantity), 0) <= p.low_stock THEN 'Low'
        ELSE 'Normal'
    END AS stock_status
FROM products p
JOIN categories c ON c.id = p.category_id
LEFT JOIN product_locations pl ON pl.product_id = p.id
LEFT JOIN racks r ON r.id = pl.rack_id
GROUP BY p.id, c.name;

-- Ringkasan PO: keterlambatan dihitung dari tanggal (bukan disimpan)
CREATE OR REPLACE VIEW v_restock_overview AS
SELECT
    ro.*,
    u.company_name AS supplier_company,
    u.full_name AS supplier_contact,
    (ro.status IN ('Confirmed', 'In Transit') AND ro.expected_delivery_date < CURRENT_DATE) AS is_late,
    (SELECT COUNT(*) FROM restock_order_items i WHERE i.restock_order_id = ro.id)::INTEGER AS item_count,
    (SELECT COALESCE(SUM(i.quantity), 0) FROM restock_order_items i WHERE i.restock_order_id = ro.id)::BIGINT AS total_quantity,
    rr.rating,
    rr.feedback
FROM restock_orders ro
JOIN users u ON u.id = ro.supplier_id
LEFT JOIN restock_ratings rr ON rr.restock_order_id = ro.id;


-- INDEX
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_supplier_status ON users(supplier_status);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_product_locations_rack ON product_locations(rack_id);
CREATE INDEX IF NOT EXISTS idx_supplier_categories_supplier ON supplier_categories(supplier_id);
CREATE INDEX IF NOT EXISTS idx_restock_supplier_status ON restock_orders(supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_restock_status_eta ON restock_orders(status, expected_delivery_date);
CREATE INDEX IF NOT EXISTS idx_restock_items_product ON restock_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_restock_updates_order ON restock_delivery_updates(restock_order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type_status ON transactions(type, status);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_created_by ON transactions(created_by);
CREATE INDEX IF NOT EXISTS idx_transaction_items_product ON transaction_items(product_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_tx ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(delivery_status);
CREATE INDEX IF NOT EXISTS idx_shipment_updates_shipment ON shipment_updates(shipment_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_tx ON stock_movements(transaction_id);
CREATE INDEX IF NOT EXISTS idx_issue_reports_status ON issue_reports(status);
CREATE INDEX IF NOT EXISTS idx_issue_reports_reporter ON issue_reports(reported_by);
CREATE INDEX IF NOT EXISTS idx_issue_reports_remedy_supplier ON issue_reports(remedy_supplier_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);



-- 31. DATA DUMMY KATEGORI
INSERT INTO categories (name, description, image_url)
VALUES
('Paper Packaging',          'Kemasan makanan berbahan dasar kertas.',          '/images/categories/paper.svg'),
('Bagasse Packaging',        'Kemasan ramah lingkungan berbahan serat tebu.',   '/images/categories/bagasse.svg'),
('Cardboard Packaging',      'Kemasan makanan berbahan karton dan kraft.',      '/images/categories/cardboard.svg'),
('Wooden & Bamboo Supplies', 'Perlengkapan makanan berbahan kayu dan bambu.',   '/images/categories/wooden.svg'),
('Food Wrapping Supplies',   'Kertas pembungkus dan pelapis makanan.',          '/images/categories/wrapping.svg')
ON CONFLICT (name) DO NOTHING;


-- 32. DATA DUMMY RAK
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


-- 33. DATA DUMMY 25 PRODUK (setiap produk punya gambar sendiri)
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



-- Variasi status stok untuk demo: Normal, Low, Severe, Out of Stock
INSERT INTO product_locations (product_id, rack_id, quantity)
SELECT
    p.id,
    r.id,
    CASE
        WHEN p.sku = 'AYV-CAR-004' THEN 0-- Out of Stock
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

INSERT INTO stock_movements (product_id, rack_id, movement_type, quantity_change, quantity_after, notes)
SELECT pl.product_id, pl.rack_id, 'OPENING', pl.quantity, pl.quantity, 'Stok awal'
FROM product_locations pl
WHERE pl.quantity > 0
  AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.product_id = pl.product_id AND sm.movement_type = 'OPENING');


-- AKUN DUMMY (hash bcrypt via pgcrypto, cost 10)
INSERT INTO users (full_name, email, password_hash, role, company_name, phone, address,
                   supplier_status, company_description, business_field, website_url)
VALUES
('Admin AYVORA',  'admin@ayvora.local',   crypt('Admin123!',   gen_salt('bf', 10)), 'admin',
    NULL, '081234567810', 'Makassar, Sulawesi Selatan', NULL, NULL, NULL, NULL),
('Budi Santoso',  'manager@ayvora.local', crypt('Manager123!', gen_salt('bf', 10)), 'warehouse_manager',
    NULL, '081234567811', 'Makassar, Sulawesi Selatan', NULL, NULL, NULL, NULL),
('Rian Saputra',  'staff@ayvora.local',   crypt('Staff123!',   gen_salt('bf', 10)), 'warehouse_staff',
    NULL, '081234567812', 'Makassar, Sulawesi Selatan', NULL, NULL, NULL, NULL),
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
  AND u.role = 'supplier'
  AND c.name IN ('Paper Packaging', 'Bagasse Packaging', 'Cardboard Packaging')
ON CONFLICT (supplier_id, category_id) DO NOTHING;


-- DATA DEMO ALUR OPERASIONAL
-- Dibuat lewat jalur yang sama dengan aplikasi (trigger aktif),
-- sehingga sekaligus membuktikan aturan database berjalan.
DO $$
DECLARE
    v_manager UUID; v_staff UUID; v_supplier UUID;
    v_po UUID; v_tx UUID;
    v_prod_pap3 UUID; v_prod_pap1 UUID; v_prod_pap2 UUID; v_prod_bag1 UUID; v_prod_bag2 UUID; v_prod_car1 UUID;
    v_rack_a1 UUID; v_rack_b1 UUID; v_rack_c1 UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM restock_orders) OR EXISTS (SELECT 1 FROM transactions) THEN
        RETURN;  -- data demo sudah ada
    END IF;

    SELECT id INTO v_manager  FROM users WHERE email = 'manager@ayvora.local';
    SELECT id INTO v_staff    FROM users WHERE email = 'staff@ayvora.local';
    SELECT id INTO v_supplier FROM users WHERE email = 'andi@ecopack.local';

    SELECT id INTO v_prod_pap1 FROM products WHERE sku = 'AYV-PAP-001';
    SELECT id INTO v_prod_pap2 FROM products WHERE sku = 'AYV-PAP-002';
    SELECT id INTO v_prod_pap3 FROM products WHERE sku = 'AYV-PAP-003';
    SELECT id INTO v_prod_bag1 FROM products WHERE sku = 'AYV-BAG-001';
    SELECT id INTO v_prod_bag2 FROM products WHERE sku = 'AYV-BAG-002';
    SELECT id INTO v_prod_car1 FROM products WHERE sku = 'AYV-CAR-001';
    SELECT id INTO v_rack_a1 FROM racks WHERE rack_code = 'A-01';
    SELECT id INTO v_rack_b1 FROM racks WHERE rack_code = 'B-01';
    SELECT id INTO v_rack_c1 FROM racks WHERE rack_code = 'C-01';

    -- PO 1: Pending (menunggu konfirmasi supplier)
    INSERT INTO restock_orders (supplier_id, created_by, expected_delivery_date, notes)
    VALUES (v_supplier, v_manager, CURRENT_DATE + 7, 'Restock gelas kertas 16 oz yang hampir habis.')
    RETURNING id INTO v_po;
    INSERT INTO restock_order_items (restock_order_id, product_id, quantity) VALUES
        (v_po, v_prod_pap3, 500), (v_po, v_prod_pap2, 300);

    -- PO 2: In Transit
    INSERT INTO restock_orders (supplier_id, created_by, order_date, expected_delivery_date, notes)
    VALUES (v_supplier, v_manager, CURRENT_DATE - 3, CURRENT_DATE + 2, 'Restock mangkuk serat tebu.')
    RETURNING id INTO v_po;
    INSERT INTO restock_order_items (restock_order_id, product_id, quantity) VALUES
        (v_po, v_prod_bag1, 400), (v_po, v_prod_bag2, 300);
    UPDATE restock_orders SET status = 'Confirmed' WHERE id = v_po;
    UPDATE restock_orders SET status = 'In Transit', shipped_date = CURRENT_DATE - 1,
        courier_name = 'JNE Cargo', tracking_number = 'JNE0099887766' WHERE id = v_po;

    -- PO 3: Confirmed tetapi TERLAMBAT (melewati estimasi)
    INSERT INTO restock_orders (supplier_id, created_by, order_date, expected_delivery_date, notes)
    VALUES (v_supplier, v_manager, CURRENT_DATE - 10, CURRENT_DATE - 3, 'Restock kotak nasi kraft.')
    RETURNING id INTO v_po;
    INSERT INTO restock_order_items (restock_order_id, product_id, quantity) VALUES (v_po, v_prod_car1, 400);
    UPDATE restock_orders SET status = 'Confirmed' WHERE id = v_po;

    -- PO 4: Received + Incoming Transaction Pending (menunggu persetujuan Manager)
    INSERT INTO restock_orders (supplier_id, created_by, order_date, expected_delivery_date, notes)
    VALUES (v_supplier, v_manager, CURRENT_DATE - 6, CURRENT_DATE - 1, 'Restock gelas kertas 8 oz.')
    RETURNING id INTO v_po;
    INSERT INTO restock_order_items (restock_order_id, product_id, quantity) VALUES (v_po, v_prod_pap1, 400);
    UPDATE restock_orders SET status = 'Confirmed' WHERE id = v_po;
    UPDATE restock_orders SET status = 'In Transit' WHERE id = v_po;
    UPDATE restock_orders SET status = 'Received' WHERE id = v_po;

    INSERT INTO transactions (type, transaction_date, restock_order_id, supplier_id, notes, created_by)
    VALUES ('INCOMING', CURRENT_DATE, v_po, v_supplier, 'Penerimaan dari PO, pemeriksaan fisik selesai.', v_staff)
    RETURNING id INTO v_tx;
    INSERT INTO transaction_items (transaction_id, product_id, rack_id, quantity, damaged_quantity, item_note)
    VALUES (v_tx, v_prod_pap1, v_rack_a1, 395, 5, '5 pcs penyok, tidak dimasukkan ke stok layak pakai.');

    -- Barang keluar: Pending
    INSERT INTO transactions (type, transaction_date, customer_name, notes, created_by)
    VALUES ('OUTGOING', CURRENT_DATE, 'Kafe Kopi Senja', 'Pesanan mingguan.', v_staff)
    RETURNING id INTO v_tx;
    INSERT INTO transaction_items (transaction_id, product_id, rack_id, quantity)
    VALUES (v_tx, v_prod_pap1, v_rack_a1, 100);

    -- Barang keluar: Approved (stok sudah berkurang, pengiriman Preparing)
    INSERT INTO transactions (type, transaction_date, customer_name, notes, created_by)
    VALUES ('OUTGOING', CURRENT_DATE - 1, 'Resto Nusantara', 'Pesanan kemasan bagasse.', v_staff)
    RETURNING id INTO v_tx;
    INSERT INTO transaction_items (transaction_id, product_id, rack_id, quantity)
    VALUES (v_tx, v_prod_bag1, v_rack_b1, 40);
    UPDATE transactions SET status = 'Approved', reviewed_by = v_manager WHERE id = v_tx;
    UPDATE shipments SET delivery_status = 'Preparing', updated_by = v_staff, notes = 'Barang sedang dikemas.'
    WHERE transaction_id = v_tx;

    -- Barang keluar: Rejected (dengan alasan)
    INSERT INTO transactions (type, transaction_date, customer_name, notes, created_by)
    VALUES ('OUTGOING', CURRENT_DATE - 2, 'Warung Bu Sari', 'Permintaan dadakan.', v_staff)
    RETURNING id INTO v_tx;
    INSERT INTO transaction_items (transaction_id, product_id, rack_id, quantity)
    VALUES (v_tx, v_prod_pap2, v_rack_a1, 20);
    UPDATE transactions SET status = 'Rejected', reviewed_by = v_manager,
        rejection_reason = 'Stok dialokasikan untuk pesanan pelanggan lain.' WHERE id = v_tx;

    -- Notifikasi awal
    INSERT INTO notifications (user_id, title, message, type, link_path)
    SELECT id, 'Transaksi menunggu persetujuan',
           'Ada transaksi barang masuk dan keluar berstatus Pending yang perlu diperiksa.',
           'transaction_pending', '/manager/approvals'
    FROM users WHERE role = 'warehouse_manager';

    INSERT INTO notifications (user_id, title, message, type, link_path)
    VALUES (v_supplier, 'PO baru diterima', 'Ada PO baru yang menunggu konfirmasi Anda.', 'restock_new', '/supplier/restock');

    INSERT INTO notifications (user_id, title, message, type, link_path)
    VALUES (v_staff, 'Transaksi ditolak', 'Transaksi barang keluar untuk Warung Bu Sari ditolak. Lihat alasannya.', 'transaction_rejected', '/staff/transactions');

    INSERT INTO activity_logs (user_id, activity, description)
    VALUES (v_manager, 'seed', 'Data demo AYVORA dibuat.');
END $$;


-- CEK DATA (hasil terakhir tampil di pgAdmin)
SELECT 'users' AS tabel, COUNT(*) AS jumlah FROM users
UNION ALL SELECT 'categories', COUNT(*) FROM categories
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'racks', COUNT(*) FROM racks
UNION ALL SELECT 'restock_orders', COUNT(*) FROM restock_orders
UNION ALL SELECT 'transactions', COUNT(*) FROM transactions
UNION ALL SELECT 'stock_movements', COUNT(*) FROM stock_movements;