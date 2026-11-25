-- Jalankan SETELAH AYVORA_FINAL_DATABASE.sql:
--   psql -d ayvora -f database/tests/db-integrity-test.sql
-- Seluruh pengujian berjalan di dalam transaksi lalu di-ROLLBACK,
-- jadi data database tidak berubah.
\set ON_ERROR_STOP off
BEGIN;

CREATE TEMP TABLE test_results (no SERIAL, name TEXT, ok BOOLEAN, info TEXT);

-- Memeriksa suatu kondisi
CREATE FUNCTION pg_temp.check_that(p_name TEXT, p_ok BOOLEAN, p_info TEXT DEFAULT NULL) RETURNS VOID AS $$
BEGIN INSERT INTO test_results(name, ok, info) VALUES (p_name, COALESCE(p_ok, FALSE), p_info); END; $$ LANGUAGE plpgsql;

-- Perintah SQL HARUS gagal dengan pesan yang mengandung p_pattern
CREATE FUNCTION pg_temp.expect_error(p_name TEXT, p_stmt TEXT, p_pattern TEXT) RETURNS VOID AS $$
BEGIN
    BEGIN
        EXECUTE p_stmt;
        INSERT INTO test_results(name, ok, info) VALUES (p_name, FALSE, 'tidak error');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results(name, ok, info) VALUES (p_name, SQLERRM ILIKE '%' || p_pattern || '%', SQLERRM);
    END;
END; $$ LANGUAGE plpgsql;

CREATE FUNCTION pg_temp.stock_of(p_sku TEXT) RETURNS BIGINT AS $$
    SELECT current_stock FROM v_product_stock WHERE sku = p_sku; $$ LANGUAGE sql;
CREATE FUNCTION pg_temp.uid(p_email TEXT) RETURNS UUID AS $$ SELECT id FROM users WHERE email = p_email; $$ LANGUAGE sql;
CREATE FUNCTION pg_temp.pid(p_sku TEXT) RETURNS UUID AS $$ SELECT id FROM products WHERE sku = p_sku; $$ LANGUAGE sql;
CREATE FUNCTION pg_temp.rid(p_code TEXT) RETURNS UUID AS $$ SELECT id FROM racks WHERE rack_code = p_code; $$ LANGUAGE sql;

-- ---------- A. DATA DASAR & KONSTRAIN ----------
SELECT pg_temp.check_that('4 akun dummy ada', (SELECT COUNT(*) FROM users) = 4);
SELECT pg_temp.check_that('25 produk & 5 kategori & 25 rak',
    (SELECT COUNT(*) FROM products) = 25 AND (SELECT COUNT(*) FROM categories) = 5 AND (SELECT COUNT(*) FROM racks) = 25);
SELECT pg_temp.check_that('password dummy valid (bcrypt, 4 akun)',
    (SELECT COUNT(*) FROM users WHERE password_hash LIKE '$2a$10$%'
        AND password_hash = crypt(CASE email
            WHEN 'admin@ayvora.local' THEN 'Admin123!' WHEN 'manager@ayvora.local' THEN 'Manager123!'
            WHEN 'staff@ayvora.local' THEN 'Staff123!' ELSE 'DemoSupplier123!' END, password_hash)) = 4);
SELECT pg_temp.check_that('setiap produk punya gambar berbeda', (SELECT COUNT(DISTINCT image_url) FROM products) = 25);
SELECT pg_temp.check_that('setiap kategori punya gambar berbeda', (SELECT COUNT(DISTINCT image_url) FROM categories) = 5);

SELECT pg_temp.expect_error('SKU duplikat ditolak',
    $q$INSERT INTO products(sku,name,category_id,buy_price,sell_price,min_stock,low_stock,unit)
       SELECT 'AYV-PAP-001','X',category_id,1,1,1,2,'pcs' FROM products LIMIT 1$q$, 'duplicate key');
SELECT pg_temp.expect_error('Email duplikat ditolak',
    $q$INSERT INTO users(full_name,email,password_hash,role) VALUES ('X','admin@ayvora.local','x','admin')$q$, 'duplicate key');
SELECT pg_temp.expect_error('Stok negatif ditolak',
    $q$UPDATE product_locations SET quantity = -1 WHERE id = (SELECT id FROM product_locations LIMIT 1)$q$, 'check constraint');
SELECT pg_temp.expect_error('Stok Low harus > stok minimum',
    $q$UPDATE products SET low_stock = min_stock WHERE sku = 'AYV-PAP-001'$q$, 'chk_product_stock_threshold');
SELECT pg_temp.expect_error('Supplier Rejected wajib alasan',
    $q$INSERT INTO users(full_name,email,password_hash,role,company_name,supplier_status) VALUES ('X','rej@x.local','x','supplier','PT X','Rejected')$q$, 'chk_supplier_rejection_note');
SELECT pg_temp.expect_error('Non-supplier tidak boleh punya supplier_status',
    $q$INSERT INTO users(full_name,email,password_hash,role,supplier_status) VALUES ('X','na@x.local','x','admin','Pending')$q$, 'chk_user_supplier_status');

-- ---------- B. STATUS STOK OTOMATIS ----------
SELECT pg_temp.check_that('CAR-004 = Out of Stock', (SELECT stock_status FROM v_product_stock WHERE sku='AYV-CAR-004') = 'Out of Stock');
SELECT pg_temp.check_that('WOD-003 stok 180 <= min 200 = Severe', (SELECT stock_status FROM v_product_stock WHERE sku='AYV-WOD-003') = 'Severe');
SELECT pg_temp.check_that('WOD-001 stok 300 (min 200, low 400) = Low', (SELECT stock_status FROM v_product_stock WHERE sku='AYV-WOD-001') = 'Low');
SELECT pg_temp.check_that('PAP-001 stok 300 (low 200) = Normal', (SELECT stock_status FROM v_product_stock WHERE sku='AYV-PAP-001') = 'Normal');
SELECT pg_temp.check_that('semua 4 status stok muncul pada data awal',
    (SELECT COUNT(DISTINCT stock_status) FROM v_product_stock) = 4);

-- ---------- C. INTEGRITAS STOK vs RIWAYAT ----------
SELECT pg_temp.check_that('stok tiap rak = jumlah stock_movements (data awal + demo)',
    NOT EXISTS (
        SELECT 1 FROM product_locations pl
        WHERE pl.quantity <> COALESCE((SELECT SUM(quantity_change) FROM stock_movements sm
                                       WHERE sm.product_id = pl.product_id AND sm.rack_id = pl.rack_id), 0)));
SELECT pg_temp.check_that('semua movement non-OPENING punya referensi transaksi',
    NOT EXISTS (SELECT 1 FROM stock_movements WHERE movement_type <> 'OPENING' AND transaction_id IS NULL));

-- ---------- D. BARANG MASUK ----------
-- Data demo: incoming Pending dari PO (PAP-001 sudah memuat 5 rusak)
CREATE TEMP TABLE ctx AS
SELECT t.id AS in_tx FROM transactions t WHERE t.type = 'INCOMING' AND t.status = 'Pending' LIMIT 1;

SELECT pg_temp.check_that('Incoming Pending TIDAK mengubah stok (PAP-001 tetap 300)', pg_temp.stock_of('AYV-PAP-001') = 300);

SELECT pg_temp.expect_error('Staff tidak boleh meng-approve',
    format($q$UPDATE transactions SET status='Approved', reviewed_by=%L WHERE id=%L$q$, pg_temp.uid('staff@ayvora.local'), (SELECT in_tx FROM ctx)),
    'Warehouse Manager');
SELECT pg_temp.expect_error('Admin tidak boleh meng-approve transaksi',
    format($q$UPDATE transactions SET status='Approved', reviewed_by=%L WHERE id=%L$q$, pg_temp.uid('admin@ayvora.local'), (SELECT in_tx FROM ctx)),
    'Warehouse Manager');
SELECT pg_temp.expect_error('Approve tanpa pemeriksa ditolak',
    format($q$UPDATE transactions SET status='Approved' WHERE id=%L$q$, (SELECT in_tx FROM ctx)), 'Warehouse Manager');
SELECT pg_temp.check_that('Stok tetap 300 setelah percobaan approve yang gagal', pg_temp.stock_of('AYV-PAP-001') = 300);

UPDATE transactions SET status='Approved', reviewed_by = pg_temp.uid('manager@ayvora.local') WHERE id = (SELECT in_tx FROM ctx);
SELECT pg_temp.check_that('Approve Incoming: stok +395 (rusak 5 tidak masuk)', pg_temp.stock_of('AYV-PAP-001') = 695, pg_temp.stock_of('AYV-PAP-001')::TEXT);
SELECT pg_temp.check_that('Approve mencatat 1 stock_movement INCOMING +395 berreferensi transaksi',
    (SELECT COUNT(*) FROM stock_movements WHERE transaction_id = (SELECT in_tx FROM ctx) AND movement_type='INCOMING' AND quantity_change=395) = 1);
SELECT pg_temp.check_that('reviewed_by & reviewed_at terisi',
    (SELECT reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL FROM transactions WHERE id = (SELECT in_tx FROM ctx)));
UPDATE transactions SET notes = notes WHERE id = (SELECT in_tx FROM ctx);
UPDATE transactions SET status = 'Approved', reviewed_by = pg_temp.uid('manager@ayvora.local') WHERE id = (SELECT in_tx FROM ctx);
SELECT pg_temp.check_that('Approve ulang tidak menambah stok lagi (tepat satu kali)', pg_temp.stock_of('AYV-PAP-001') = 695);
SELECT pg_temp.expect_error('Approved tidak bisa kembali Pending',
    format($q$UPDATE transactions SET status='Pending' WHERE id=%L$q$, (SELECT in_tx FROM ctx)), 'tidak diizinkan');
SELECT pg_temp.expect_error('Approved tidak bisa jadi Shipped (khusus keluar)',
    format($q$UPDATE transactions SET status='Shipped' WHERE id=%L$q$, (SELECT in_tx FROM ctx)), 'chk_transaction_shipped_outgoing');
SELECT pg_temp.expect_error('Item transaksi Approved tidak boleh diubah',
    format($q$UPDATE transaction_items SET quantity = 1 WHERE transaction_id=%L$q$, (SELECT in_tx FROM ctx)), 'berstatus Pending');
SELECT pg_temp.expect_error('Transaksi Approved tidak boleh dihapus',
    format($q$DELETE FROM transactions WHERE id=%L$q$, (SELECT in_tx FROM ctx)), 'Pending');

-- PO: satu PO hanya untuk satu incoming non-Rejected
SELECT pg_temp.expect_error('PO yang sama tidak boleh dipakai incoming kedua',
    format($q$INSERT INTO transactions(type,restock_order_id,supplier_id,created_by)
              SELECT 'INCOMING', restock_order_id, supplier_id, %L FROM transactions WHERE id=%L$q$,
           pg_temp.uid('staff@ayvora.local'), (SELECT in_tx FROM ctx)), 'uq_transactions_po_active');
SELECT pg_temp.expect_error('Incoming dari PO yang belum Received ditolak',
    format($q$INSERT INTO transactions(type,restock_order_id,supplier_id,created_by)
              SELECT 'INCOMING', id, supplier_id, %L FROM restock_orders WHERE status='Pending' LIMIT 1$q$,
           pg_temp.uid('staff@ayvora.local')), 'Received');
SELECT pg_temp.expect_error('Transaksi tidak boleh dibuat oleh Manager',
    format($q$INSERT INTO transactions(type,customer_name,created_by) VALUES ('OUTGOING','X',%L)$q$, pg_temp.uid('manager@ayvora.local')),
    'Staff Gudang');

-- Incoming Rejected -> stok tidak berubah, PO boleh dipakai ulang
DO $$
DECLARE v_po UUID; v_tx1 UUID; v_tx2 UUID; v_before BIGINT;
BEGIN
    SELECT id INTO v_po FROM restock_orders WHERE po_number IS NOT NULL AND status='Pending' LIMIT 1;
    UPDATE restock_orders SET status='Confirmed' WHERE id=v_po;
    UPDATE restock_orders SET status='In Transit' WHERE id=v_po;
    UPDATE restock_orders SET status='Received' WHERE id=v_po;
    v_before := pg_temp.stock_of('AYV-PAP-003');
    INSERT INTO transactions(type,restock_order_id,supplier_id,created_by)
        SELECT 'INCOMING', v_po, supplier_id, pg_temp.uid('staff@ayvora.local') FROM restock_orders WHERE id=v_po RETURNING id INTO v_tx1;
    INSERT INTO transaction_items(transaction_id,product_id,rack_id,quantity) VALUES (v_tx1, pg_temp.pid('AYV-PAP-003'), pg_temp.rid('A-01'), 500);
    PERFORM pg_temp.check_that('item incoming dari PO: expected_quantity terisi otomatis dari PO',
        (SELECT expected_quantity FROM transaction_items WHERE transaction_id=v_tx1) = 500);
    PERFORM pg_temp.expect_error('Produk di luar PO ditolak',
        format($q$INSERT INTO transaction_items(transaction_id,product_id,rack_id,quantity) VALUES (%L,%L,%L,5)$q$, v_tx1, pg_temp.pid('AYV-WOD-001'), pg_temp.rid('D-01')),
        'tidak terdapat pada PO');
    PERFORM pg_temp.expect_error('Reject tanpa alasan ditolak',
        format($q$UPDATE transactions SET status='Rejected', reviewed_by=%L WHERE id=%L$q$, pg_temp.uid('manager@ayvora.local'), v_tx1),
        'Alasan penolakan wajib diisi');
    UPDATE transactions SET status='Rejected', reviewed_by=pg_temp.uid('manager@ayvora.local'), rejection_reason='Barang tidak sesuai.' WHERE id=v_tx1;
    PERFORM pg_temp.check_that('Rejected TIDAK mengubah stok', pg_temp.stock_of('AYV-PAP-003') = v_before);
    PERFORM pg_temp.check_that('Rejected tidak membuat stock_movement', NOT EXISTS (SELECT 1 FROM stock_movements WHERE transaction_id=v_tx1));
    INSERT INTO transactions(type,restock_order_id,supplier_id,created_by)
        SELECT 'INCOMING', v_po, supplier_id, pg_temp.uid('staff@ayvora.local') FROM restock_orders WHERE id=v_po RETURNING id INTO v_tx2;
    PERFORM pg_temp.check_that('Setelah Rejected, PO boleh diajukan ulang', v_tx2 IS NOT NULL);
END $$;

-- ---------- E. BARANG KELUAR ----------
DO $$
DECLARE v_tx UUID; v_tx2 UUID; v_ship UUID; v_before BIGINT;
BEGIN
    v_before := pg_temp.stock_of('AYV-BAG-002');   -- 250

    PERFORM pg_temp.expect_error('Keluar melebihi stok rak ditolak saat dibuat',
        format($q$WITH t AS (INSERT INTO transactions(type,customer_name,created_by) VALUES ('OUTGOING','Cust',%L) RETURNING id)
                  INSERT INTO transaction_items(transaction_id,product_id,rack_id,quantity) SELECT id,%L,%L,9999 FROM t$q$,
               pg_temp.uid('staff@ayvora.local'), pg_temp.pid('AYV-BAG-002'), pg_temp.rid('B-01')), 'melebihi stok');

    INSERT INTO transactions(type,customer_name,created_by) VALUES ('OUTGOING','Cust A',pg_temp.uid('staff@ayvora.local')) RETURNING id INTO v_tx;
    INSERT INTO transaction_items(transaction_id,product_id,rack_id,quantity) VALUES (v_tx, pg_temp.pid('AYV-BAG-002'), pg_temp.rid('B-01'), 200);
    INSERT INTO transactions(type,customer_name,created_by) VALUES ('OUTGOING','Cust B',pg_temp.uid('staff@ayvora.local')) RETURNING id INTO v_tx2;
    INSERT INTO transaction_items(transaction_id,product_id,rack_id,quantity) VALUES (v_tx2, pg_temp.pid('AYV-BAG-002'), pg_temp.rid('B-01'), 200);

    PERFORM pg_temp.check_that('Outgoing Pending TIDAK mengubah stok', pg_temp.stock_of('AYV-BAG-002') = v_before);
    PERFORM pg_temp.check_that('nomor transaksi otomatis TRX-OUT-', (SELECT transaction_number LIKE 'TRX-OUT-%' FROM transactions WHERE id=v_tx));

    UPDATE transactions SET status='Approved', reviewed_by=pg_temp.uid('manager@ayvora.local') WHERE id=v_tx;
    PERFORM pg_temp.check_that('Approve Outgoing: stok berkurang 200 tepat sekali', pg_temp.stock_of('AYV-BAG-002') = v_before - 200, pg_temp.stock_of('AYV-BAG-002')::TEXT);
    PERFORM pg_temp.check_that('stock_movement OUTGOING -200 tercatat',
        (SELECT COUNT(*) FROM stock_movements WHERE transaction_id=v_tx AND quantity_change=-200 AND movement_type='OUTGOING') = 1);

    -- Dua transaksi bersamaan: yang kedua harus gagal & tidak membuat stok negatif
    PERFORM pg_temp.expect_error('Approve kedua gagal bila stok tidak cukup (stok tidak negatif)',
        format($q$UPDATE transactions SET status='Approved', reviewed_by=%L WHERE id=%L$q$, pg_temp.uid('manager@ayvora.local'), v_tx2),
        'Stok tidak mencukupi');
    PERFORM pg_temp.check_that('Transaksi kedua tetap Pending & stok tidak berubah',
        (SELECT status FROM transactions WHERE id=v_tx2) = 'Pending' AND pg_temp.stock_of('AYV-BAG-002') = v_before - 200);

    -- Pengiriman otomatis & alur status
    SELECT id INTO v_ship FROM shipments WHERE transaction_id=v_tx;
    PERFORM pg_temp.check_that('Shipment dibuat otomatis (Waiting)', (SELECT delivery_status FROM shipments WHERE id=v_ship) = 'Waiting');
    PERFORM pg_temp.expect_error('Waiting tidak boleh langsung Shipped',
        format($q$UPDATE shipments SET delivery_status='Shipped' WHERE id=%L$q$, v_ship), 'tidak diizinkan');
    UPDATE shipments SET delivery_status='Preparing' WHERE id=v_ship;
    UPDATE shipments SET delivery_status='Ready to Ship' WHERE id=v_ship;
    UPDATE shipments SET delivery_status='Shipped', courier_name='JNE', tracking_number='JNE123', updated_by=pg_temp.uid('staff@ayvora.local') WHERE id=v_ship;
    PERFORM pg_temp.check_that('Shipped TIDAK mengurangi stok lagi', pg_temp.stock_of('AYV-BAG-002') = v_before - 200);
    PERFORM pg_temp.check_that('Status transaksi ikut menjadi Shipped', (SELECT status FROM transactions WHERE id=v_tx) = 'Shipped');
    PERFORM pg_temp.check_that('tanggal kirim aktual terisi otomatis', (SELECT actual_ship_date FROM shipments WHERE id=v_ship) = CURRENT_DATE);
    UPDATE shipments SET delivery_status='Delivery Issue', notes='Paket tertahan di hub.' WHERE id=v_ship;
    UPDATE shipments SET delivery_status='Delivered' WHERE id=v_ship;
    PERFORM pg_temp.check_that('Delivered TIDAK mengubah stok', pg_temp.stock_of('AYV-BAG-002') = v_before - 200);
    PERFORM pg_temp.check_that('riwayat pengiriman tercatat (6 langkah)', (SELECT COUNT(*) FROM shipment_updates WHERE shipment_id=v_ship) = 6,
        (SELECT COUNT(*) FROM shipment_updates WHERE shipment_id=v_ship)::TEXT);
    PERFORM pg_temp.check_that('stok bagasse = jumlah movement (konsisten)',
        (SELECT quantity FROM product_locations WHERE product_id=pg_temp.pid('AYV-BAG-002') AND rack_id=pg_temp.rid('B-01'))
        = (SELECT SUM(quantity_change) FROM stock_movements WHERE product_id=pg_temp.pid('AYV-BAG-002') AND rack_id=pg_temp.rid('B-01')));
END $$;

-- Hapus transaksi Pending (cascade item) berhasil
DO $$
DECLARE v_tx UUID;
BEGIN
    INSERT INTO transactions(type,customer_name,created_by) VALUES ('OUTGOING','Hapus Aku',pg_temp.uid('staff@ayvora.local')) RETURNING id INTO v_tx;
    INSERT INTO transaction_items(transaction_id,product_id,rack_id,quantity) VALUES (v_tx, pg_temp.pid('AYV-PAP-002'), pg_temp.rid('A-01'), 5);
    DELETE FROM transactions WHERE id=v_tx;
    PERFORM pg_temp.check_that('Transaksi Pending bisa dihapus (item ikut terhapus)',
        NOT EXISTS (SELECT 1 FROM transactions WHERE id=v_tx) AND NOT EXISTS (SELECT 1 FROM transaction_items WHERE transaction_id=v_tx));
END $$;

-- ---------- F. RESTOCK ORDER ----------
DO $$
DECLARE v_po UUID; v_sup_pending UUID;
BEGIN
    INSERT INTO restock_orders(supplier_id,created_by,expected_delivery_date) VALUES (pg_temp.uid('andi@ecopack.local'), pg_temp.uid('manager@ayvora.local'), CURRENT_DATE+5) RETURNING id INTO v_po;
    INSERT INTO restock_order_items(restock_order_id,product_id,quantity) VALUES (v_po, pg_temp.pid('AYV-PAP-004'), 100);
    PERFORM pg_temp.check_that('nomor PO otomatis PO-', (SELECT po_number LIKE 'PO-%' FROM restock_orders WHERE id=v_po));
    PERFORM pg_temp.check_that('PO baru selalu Pending', (SELECT status FROM restock_orders WHERE id=v_po) = 'Pending');
    PERFORM pg_temp.expect_error('Pending langsung Received ditolak',
        format($q$UPDATE restock_orders SET status='Received' WHERE id=%L$q$, v_po), 'tidak diizinkan');
    PERFORM pg_temp.expect_error('Reject PO tanpa alasan ditolak',
        format($q$UPDATE restock_orders SET status='Rejected' WHERE id=%L$q$, v_po), 'chk_restock_rejection');
    PERFORM pg_temp.expect_error('PO oleh Staff ditolak',
        format($q$INSERT INTO restock_orders(supplier_id,created_by,expected_delivery_date) VALUES (%L,%L,CURRENT_DATE+1)$q$, pg_temp.uid('andi@ecopack.local'), pg_temp.uid('staff@ayvora.local')), 'Warehouse Manager');

    INSERT INTO users(full_name,email,password_hash,role,company_name,supplier_status) VALUES ('Sup Pending','pend@x.local','x','supplier','PT Pending','Pending') RETURNING id INTO v_sup_pending;
    PERFORM pg_temp.expect_error('PO ke supplier Pending ditolak',
        format($q$INSERT INTO restock_orders(supplier_id,created_by,expected_delivery_date) VALUES (%L,%L,CURRENT_DATE+1)$q$, v_sup_pending, pg_temp.uid('manager@ayvora.local')), 'Approved');

    UPDATE restock_orders SET status='Confirmed' WHERE id=v_po;
    PERFORM pg_temp.expect_error('Item PO tidak boleh diubah setelah Confirmed',
        format($q$UPDATE restock_order_items SET quantity=1 WHERE restock_order_id=%L$q$, v_po), 'Pending');

    UPDATE restock_orders SET expected_delivery_date = CURRENT_DATE + 9, last_updated_by = pg_temp.uid('andi@ecopack.local'), delivery_notes='Bahan baku telat' WHERE id=v_po;
    PERFORM pg_temp.check_that('perubahan ETA tercatat di riwayat dengan nilai lama & baru',
        (SELECT COUNT(*) FROM restock_delivery_updates WHERE restock_order_id=v_po AND old_expected_date = CURRENT_DATE+5 AND new_expected_date = CURRENT_DATE+9) = 1);
    PERFORM pg_temp.check_that('ETA awal tetap tersimpan', (SELECT original_expected_delivery_date FROM restock_orders WHERE id=v_po) = CURRENT_DATE+5);

    PERFORM pg_temp.expect_error('Rating sebelum PO Received ditolak',
        format($q$INSERT INTO restock_ratings(restock_order_id,supplier_id,rated_by,rating) VALUES (%L,%L,%L,5)$q$, v_po, pg_temp.uid('andi@ecopack.local'), pg_temp.uid('manager@ayvora.local')), 'Received');
    UPDATE restock_orders SET status='In Transit' WHERE id=v_po;
    UPDATE restock_orders SET status='Received' WHERE id=v_po;
    INSERT INTO restock_ratings(restock_order_id,supplier_id,rated_by,rating,feedback) VALUES (v_po, pg_temp.uid('andi@ecopack.local'), pg_temp.uid('manager@ayvora.local'), 4, 'Tepat kualitas.');
    PERFORM pg_temp.check_that('Rating setelah Received berhasil', (SELECT rating FROM v_restock_overview WHERE id=v_po) = 4);
    PERFORM pg_temp.expect_error('Rating ganda untuk PO yang sama ditolak',
        format($q$INSERT INTO restock_ratings(restock_order_id,supplier_id,rated_by,rating) VALUES (%L,%L,%L,3)$q$, v_po, pg_temp.uid('andi@ecopack.local'), pg_temp.uid('manager@ayvora.local')), 'duplicate key');
    PERFORM pg_temp.expect_error('Rating 6 ditolak', format($q$UPDATE restock_ratings SET rating = 6 WHERE restock_order_id=%L$q$, v_po), 'check');
    PERFORM pg_temp.check_that('Status Received PO sendiri TIDAK mengubah stok PAP-004', pg_temp.stock_of('AYV-PAP-004') = 150);
END $$;

-- ---------- G. KETERLAMBATAN & NOTIFIKASI ----------
SELECT pg_temp.check_that('PO demo terlambat terdeteksi (is_late)', (SELECT COUNT(*) FROM v_restock_overview WHERE is_late) >= 1);
CREATE TEMP TABLE late_run AS SELECT detect_late_restocks() AS first_run;
SELECT pg_temp.check_that('detect_late_restocks membuat notifikasi (Manager + Supplier)', (SELECT first_run FROM late_run) >= 2, (SELECT first_run::TEXT FROM late_run));
SELECT pg_temp.check_that('detect_late_restocks idempoten (tidak menggandakan notifikasi)', detect_late_restocks() = 0);

-- ---------- H. SESI ----------
SELECT pg_temp.expect_error('token_hash sesi unik',
    format($q$INSERT INTO sessions(user_id,token_hash,expires_at) VALUES (%L,'dup',NOW()), (%L,'dup',NOW())$q$, pg_temp.uid('admin@ayvora.local'), pg_temp.uid('admin@ayvora.local')), 'duplicate key');

-- ---------- LAPORAN ----------
SELECT no, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS hasil, name, CASE WHEN ok THEN '' ELSE info END AS info FROM test_results ORDER BY no;
SELECT COUNT(*) FILTER (WHERE ok) AS lulus, COUNT(*) FILTER (WHERE NOT ok) AS gagal FROM test_results;

ROLLBACK;
