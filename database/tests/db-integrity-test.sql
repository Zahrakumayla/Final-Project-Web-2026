-- ============================================================
-- AYVORA - UJI INTEGRITAS DATABASE
-- Jalankan SETELAH AYVORA_FINAL_DATABASE.sql:
--   psql -d ayvora -f database/tests/db-integrity-test.sql
-- Seluruh pengujian berjalan di dalam transaksi lalu di-ROLLBACK,
-- jadi data database tidak berubah.
-- ============================================================
\set ON_ERROR_STOP off
BEGIN;

CREATE TEMP TABLE test_results (no SERIAL, name TEXT, ok BOOLEAN, info TEXT);

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

CREATE FUNCTION pg_temp.phys(p_sku TEXT) RETURNS BIGINT AS $$ SELECT physical_stock FROM v_product_stock WHERE sku = p_sku; $$ LANGUAGE sql;
CREATE FUNCTION pg_temp.avail(p_sku TEXT) RETURNS BIGINT AS $$ SELECT available_stock FROM v_product_stock WHERE sku = p_sku; $$ LANGUAGE sql;
CREATE FUNCTION pg_temp.uid(p_email TEXT) RETURNS UUID AS $$ SELECT id FROM users WHERE email = p_email; $$ LANGUAGE sql;
CREATE FUNCTION pg_temp.pid(p_sku TEXT) RETURNS UUID AS $$ SELECT id FROM products WHERE sku = p_sku; $$ LANGUAGE sql;
CREATE FUNCTION pg_temp.rid(p_code TEXT) RETURNS UUID AS $$ SELECT id FROM racks WHERE rack_code = p_code; $$ LANGUAGE sql;

-- Membuat PO Confirmed berisi satu produk, mengembalikan id PO
CREATE FUNCTION pg_temp.new_po(p_sku TEXT, p_qty INT) RETURNS UUID AS $$
DECLARE v UUID;
BEGIN
    INSERT INTO restock_orders(supplier_id, created_by, expected_delivery_date)
    VALUES (pg_temp.uid('andi@ecopack.local'), pg_temp.uid('manager@ayvora.local'), CURRENT_DATE + 5) RETURNING id INTO v;
    INSERT INTO restock_order_items(restock_order_id, product_id, quantity, unit_price) VALUES (v, pg_temp.pid(p_sku), p_qty, 1000);
    UPDATE restock_orders SET status = 'Confirmed' WHERE id = v;
    RETURN v;
END; $$ LANGUAGE plpgsql;

-- ---------- A. DATA DASAR & KONSTRAIN ----------
SELECT pg_temp.check_that('5 akun dummy ada', (SELECT COUNT(*) FROM users) = 5);
SELECT pg_temp.check_that('25 produk & 5 kategori & 25 rak',
    (SELECT COUNT(*) FROM products) = 25 AND (SELECT COUNT(*) FROM categories) = 5 AND (SELECT COUNT(*) FROM racks) = 25);
SELECT pg_temp.check_that('password dummy valid (bcrypt)',
    (SELECT COUNT(*) FROM users WHERE password_hash LIKE '$2a$10$%'
        AND password_hash = crypt(CASE email
            WHEN 'admin@ayvora.local' THEN 'Admin123!' WHEN 'manager@ayvora.local' THEN 'Manager123!'
            WHEN 'andi@ecopack.local' THEN 'DemoSupplier123!' ELSE 'Staff123!' END, password_hash)) = 5);
SELECT pg_temp.expect_error('SKU duplikat ditolak',
    $q$INSERT INTO products(sku,name,category_id,buy_price,sell_price,min_stock,low_stock,unit)
       SELECT 'AYV-PAP-001','X',category_id,1,1,1,2,'pcs' FROM products LIMIT 1$q$, 'duplicate key');
SELECT pg_temp.expect_error('Stok negatif ditolak',
    $q$UPDATE product_locations SET quantity = -1 WHERE id = (SELECT id FROM product_locations LIMIT 1)$q$, 'check constraint');
SELECT pg_temp.expect_error('Supplier Rejected wajib alasan',
    $q$INSERT INTO users(full_name,email,password_hash,role,company_name,supplier_status) VALUES ('X','rej@x.local','x','supplier','PT X','Rejected')$q$, 'chk_supplier_rejection_note');

-- ---------- B. STOK & RIWAYAT ----------
SELECT pg_temp.check_that('stok tiap rak = jumlah stock_movements',
    NOT EXISTS (
        SELECT 1 FROM product_locations pl
        WHERE pl.quantity <> COALESCE((SELECT SUM(quantity_change) FROM stock_movements sm
                                       WHERE sm.product_id = pl.product_id AND sm.rack_id = pl.rack_id), 0)));
SELECT pg_temp.check_that('stock_movements: sesudah = sebelum + perubahan',
    NOT EXISTS (SELECT 1 FROM stock_movements WHERE quantity_after <> quantity_before + quantity_change));
SELECT pg_temp.check_that('movement masuk menunjuk pemeriksaan & PO, keluar menunjuk barang keluar',
    NOT EXISTS (SELECT 1 FROM stock_movements WHERE (movement_type = 'INCOMING' AND (inspection_id IS NULL OR restock_order_id IS NULL))
                                                 OR (movement_type = 'OUTGOING' AND outbound_order_id IS NULL)));
SELECT pg_temp.check_that('Stok Tersedia = Fisik - Dialokasikan (BAG-002: 250 - 40)',
    pg_temp.phys('AYV-BAG-002') = 250 AND pg_temp.avail('AYV-BAG-002') = 210);
SELECT pg_temp.check_that('Label stok dari Stok Tersedia (CAR-004 Out of Stock)',
    (SELECT stock_status FROM v_product_stock WHERE sku = 'AYV-CAR-004') = 'Out of Stock');

-- ---------- C. PURCHASE ORDER ----------
DO $$
DECLARE v_po UUID;
BEGIN
    INSERT INTO restock_orders(supplier_id,created_by,expected_delivery_date)
    VALUES (pg_temp.uid('andi@ecopack.local'), pg_temp.uid('manager@ayvora.local'), CURRENT_DATE+5) RETURNING id INTO v_po;
    INSERT INTO restock_order_items(restock_order_id,product_id,quantity,unit_price) VALUES (v_po, pg_temp.pid('AYV-PAP-004'), 100, 900);
    PERFORM pg_temp.check_that('PO baru Pending, nomor PO- otomatis', (SELECT status = 'Pending' AND po_number LIKE 'PO-%' FROM restock_orders WHERE id=v_po));
    PERFORM pg_temp.check_that('Subtotal & total harga dihitung database', (SELECT total_amount FROM v_restock_overview WHERE id=v_po) = 90000);
    PERFORM pg_temp.expect_error('Reject PO tanpa alasan ditolak',
        format($q$UPDATE restock_orders SET status='Rejected' WHERE id=%L$q$, v_po), 'chk_restock_rejection');
    PERFORM pg_temp.expect_error('Kirim barang sebelum PO Confirmed ditolak',
        format($q$INSERT INTO inbound_shipments(restock_order_id, shipped_by) VALUES (%L,%L)$q$, v_po, pg_temp.uid('andi@ecopack.local')), 'Confirmed');
    UPDATE restock_orders SET status='Rejected', status_reason='Stok bahan baku kosong' WHERE id=v_po;
    PERFORM pg_temp.expect_error('PO Rejected adalah status akhir',
        format($q$UPDATE restock_orders SET status='Confirmed' WHERE id=%L$q$, v_po), 'tidak diizinkan');
    PERFORM pg_temp.expect_error('Item PO tidak boleh diubah setelah Pending',
        format($q$UPDATE restock_order_items SET quantity=1 WHERE restock_order_id=%L$q$, v_po), 'Pending');
END $$;
SELECT pg_temp.expect_error('PO oleh Staff ditolak',
    format($q$INSERT INTO restock_orders(supplier_id,created_by,expected_delivery_date) VALUES (%L,%L,CURRENT_DATE+1)$q$,
           pg_temp.uid('andi@ecopack.local'), pg_temp.uid('staff@ayvora.local')), 'Warehouse Manager');

-- ---------- D. PENGIRIMAN, KEDATANGAN, PEMERIKSAAN, PERSETUJUAN ----------
DO $$
DECLARE v_po UUID; v_ship UUID; v_ins UUID; v_before BIGINT; v_claims INT;
BEGIN
    v_po := pg_temp.new_po('AYV-CAR-002', 100);
    v_before := pg_temp.phys('AYV-CAR-002');

    PERFORM pg_temp.expect_error('Pengiriman oleh bukan Supplier pemilik ditolak',
        format($q$INSERT INTO inbound_shipments(restock_order_id, shipped_by) VALUES (%L,%L)$q$, v_po, pg_temp.uid('manager@ayvora.local')), 'Supplier pemilik');
    INSERT INTO inbound_shipments(restock_order_id, shipped_by) VALUES (v_po, pg_temp.uid('andi@ecopack.local')) RETURNING id INTO v_ship;
    PERFORM pg_temp.check_that('Kirim Barang: In Transit + waktu kirim tercatat + item terisi dari PO',
        (SELECT status = 'In Transit' AND shipped_at IS NOT NULL FROM inbound_shipments WHERE id=v_ship)
        AND (SELECT quantity FROM inbound_shipment_items WHERE shipment_id=v_ship) = 100);
    PERFORM pg_temp.expect_error('Kirim ganda untuk PO yang sama ditolak',
        format($q$INSERT INTO inbound_shipments(restock_order_id, shipped_by) VALUES (%L,%L)$q$, v_po, pg_temp.uid('andi@ecopack.local')), 'uq_inbound_po_shipment');
    PERFORM pg_temp.expect_error('Perintah periksa sebelum Arrived ditolak',
        format($q$INSERT INTO inspections(shipment_id, assigned_to, assigned_by) VALUES (%L,%L,%L)$q$, v_ship, pg_temp.uid('staff@ayvora.local'), pg_temp.uid('manager@ayvora.local')), 'Arrived');
    PERFORM pg_temp.expect_error('Arrived tanpa foto ditolak',
        format($q$UPDATE inbound_shipments SET status='Arrived', arrived_by=%L WHERE id=%L$q$, pg_temp.uid('andi@ecopack.local'), v_ship), 'Foto');
    PERFORM pg_temp.expect_error('Staff tidak bisa konfirmasi kedatangan',
        format($q$UPDATE inbound_shipments SET status='Arrived', arrival_photo_url='/x.png', arrived_by=%L WHERE id=%L$q$, pg_temp.uid('staff@ayvora.local'), v_ship), 'Supplier pemilik');
    UPDATE inbound_shipments SET status='Arrived', arrival_photo_url='/x.png', arrived_by=pg_temp.uid('andi@ecopack.local') WHERE id=v_ship;
    PERFORM pg_temp.check_that('Arrived: waktu tiba tercatat, stok belum berubah',
        (SELECT arrived_at IS NOT NULL FROM inbound_shipments WHERE id=v_ship) AND pg_temp.phys('AYV-CAR-002') = v_before);

    PERFORM pg_temp.expect_error('Pemeriksaan ditugaskan ke non-Staff ditolak',
        format($q$INSERT INTO inspections(shipment_id, assigned_to, assigned_by) VALUES (%L,%L,%L)$q$, v_ship, pg_temp.uid('manager@ayvora.local'), pg_temp.uid('manager@ayvora.local')), 'Staff Gudang');
    INSERT INTO inspections(shipment_id, assigned_to, assigned_by) VALUES (v_ship, pg_temp.uid('staff@ayvora.local'), pg_temp.uid('manager@ayvora.local')) RETURNING id INTO v_ins;
    PERFORM pg_temp.check_that('Pemeriksaan baru: Awaiting Inspection', (SELECT status FROM inspections WHERE id=v_ins) = 'Awaiting Inspection');
    PERFORM pg_temp.expect_error('Isi hasil sebelum Mulai Periksa ditolak',
        format($q$INSERT INTO inspection_items(inspection_id,product_id,ordered_qty,received_qty,good_qty,damaged_qty,rack_id) VALUES (%L,%L,100,100,100,0,%L)$q$, v_ins, pg_temp.pid('AYV-CAR-002'), pg_temp.rid('C-01')), 'Under Inspection');
    UPDATE inspections SET status='Under Inspection' WHERE id=v_ins;
    PERFORM pg_temp.check_that('Mulai Periksa mencatat waktu', (SELECT started_at IS NOT NULL FROM inspections WHERE id=v_ins));

    PERFORM pg_temp.expect_error('Rumus diterima = baik + rusak dijaga',
        format($q$INSERT INTO inspection_items(inspection_id,product_id,ordered_qty,received_qty,good_qty,damaged_qty,rack_id,note) VALUES (%L,%L,100,90,80,5,%L,'x')$q$, v_ins, pg_temp.pid('AYV-CAR-002'), pg_temp.rid('C-01')), 'chk_inspection_item_formula');
    PERFORM pg_temp.expect_error('Diterima melebihi pesanan ditolak',
        format($q$INSERT INTO inspection_items(inspection_id,product_id,ordered_qty,received_qty,good_qty,damaged_qty,rack_id) VALUES (%L,%L,100,110,110,0,%L)$q$, v_ins, pg_temp.pid('AYV-CAR-002'), pg_temp.rid('C-01')), 'chk_inspection_item_max');
    PERFORM pg_temp.expect_error('Barang rusak tanpa foto ditolak',
        format($q$INSERT INTO inspection_items(inspection_id,product_id,ordered_qty,received_qty,good_qty,damaged_qty,rack_id,note) VALUES (%L,%L,100,100,95,5,%L,'penyok')$q$, v_ins, pg_temp.pid('AYV-CAR-002'), pg_temp.rid('C-01')), 'chk_inspection_item_photo');
    PERFORM pg_temp.expect_error('Barang kurang tanpa catatan ditolak',
        format($q$INSERT INTO inspection_items(inspection_id,product_id,ordered_qty,received_qty,good_qty,damaged_qty,rack_id) VALUES (%L,%L,100,90,90,0,%L)$q$, v_ins, pg_temp.pid('AYV-CAR-002'), pg_temp.rid('C-01')), 'chk_inspection_item_note');
    PERFORM pg_temp.expect_error('Kirim laporan tanpa hasil ditolak',
        format($q$UPDATE inspections SET status='Inspection Completed' WHERE id=%L$q$, v_ins), 'belum lengkap');

    INSERT INTO inspection_items(inspection_id,product_id,ordered_qty,received_qty,good_qty,damaged_qty,rack_id,note,photo_url)
    VALUES (v_ins, pg_temp.pid('AYV-CAR-002'), 100, 96, 90, 6, pg_temp.rid('C-01'), '6 penyok, 4 kurang', '/r.png');
    PERFORM pg_temp.check_that('Kurang dihitung database (100 - 96 = 4)', (SELECT shortage_qty FROM inspection_items WHERE inspection_id=v_ins) = 4);
    UPDATE inspections SET status='Inspection Completed' WHERE id=v_ins;
    PERFORM pg_temp.check_that('Kirim laporan: Inspection Completed + Awaiting Approval, stok belum berubah',
        (SELECT status = 'Inspection Completed' AND approval_status = 'Awaiting Approval' FROM inspections WHERE id=v_ins) AND pg_temp.phys('AYV-CAR-002') = v_before);

    PERFORM pg_temp.expect_error('Staff tidak punya persetujuan akhir',
        format($q$UPDATE inspections SET approval_status='Approved', approved_by=%L WHERE id=%L$q$, pg_temp.uid('staff@ayvora.local'), v_ins), 'Warehouse Manager');
    PERFORM pg_temp.expect_error('Minta revisi tanpa alasan ditolak',
        format($q$UPDATE inspections SET approval_status='Revision Requested' WHERE id=%L$q$, v_ins), 'Alasan revisi');
    UPDATE inspections SET approval_status='Revision Requested', revision_reason='Foto kurang jelas' WHERE id=v_ins;
    PERFORM pg_temp.check_that('Revisi: kembali Under Inspection', (SELECT status FROM inspections WHERE id=v_ins) = 'Under Inspection');
    UPDATE inspection_items SET photo_url = '/r2.png' WHERE inspection_id=v_ins;
    UPDATE inspections SET status='Inspection Completed' WHERE id=v_ins;
    PERFORM pg_temp.check_that('Kirim ulang: Awaiting Approval, pengiriman ke-2',
        (SELECT approval_status = 'Awaiting Approval' AND submission_count = 2 FROM inspections WHERE id=v_ins));

    UPDATE inspections SET approval_status='Approved', approved_by=pg_temp.uid('manager@ayvora.local') WHERE id=v_ins;
    PERFORM pg_temp.check_that('Disetujui: stok +90 (hanya jumlah baik)', pg_temp.phys('AYV-CAR-002') = v_before + 90, pg_temp.phys('AYV-CAR-002')::TEXT);
    PERFORM pg_temp.check_that('Stock movement: sebelum, +90, sesudah, PO, penyetuju',
        (SELECT COUNT(*) FROM stock_movements WHERE inspection_id=v_ins AND quantity_change=90 AND restock_order_id=v_po
            AND created_by = pg_temp.uid('manager@ayvora.local') AND quantity_after = quantity_before + 90) = 1);
    SELECT COUNT(*) INTO v_claims FROM claims WHERE inspection_id=v_ins;
    PERFORM pg_temp.check_that('Klaim otomatis: kurang 4 + rusak 6',
        v_claims = 2 AND EXISTS (SELECT 1 FROM claims WHERE inspection_id=v_ins AND claim_type='Shortage' AND quantity=4)
                     AND EXISTS (SELECT 1 FROM claims WHERE inspection_id=v_ins AND claim_type='Damaged' AND quantity=6));
    PERFORM pg_temp.check_that('PO menjadi Partially Received', (SELECT receipt_status FROM restock_orders WHERE id=v_po) = 'Partially Received');

    UPDATE inspections SET approval_status='Approved', approved_by=pg_temp.uid('manager@ayvora.local') WHERE id=v_ins;
    PERFORM pg_temp.check_that('Approve ganda tidak menambah stok lagi', pg_temp.phys('AYV-CAR-002') = v_before + 90);
    PERFORM pg_temp.expect_error('Hasil pemeriksaan disetujui tidak bisa diubah',
        format($q$UPDATE inspection_items SET good_qty = 96, damaged_qty = 0 WHERE inspection_id=%L$q$, v_ins), 'Under Inspection');
END $$;

-- Barang tidak ditemukan & produk salah
DO $$
DECLARE v_po UUID; v_ship UUID; v_ins UUID; v_ins2 UUID;
BEGIN
    v_po := pg_temp.new_po('AYV-CAR-003', 50);
    INSERT INTO inbound_shipments(restock_order_id, shipped_by) VALUES (v_po, pg_temp.uid('andi@ecopack.local')) RETURNING id INTO v_ship;
    UPDATE inbound_shipments SET status='Arrived', arrival_photo_url='/x.png', arrived_by=pg_temp.uid('andi@ecopack.local') WHERE id=v_ship;
    INSERT INTO inspections(shipment_id, assigned_to, assigned_by) VALUES (v_ship, pg_temp.uid('staff@ayvora.local'), pg_temp.uid('manager@ayvora.local')) RETURNING id INTO v_ins;
    PERFORM pg_temp.expect_error('Dua pemeriksaan aktif untuk satu pengiriman ditolak',
        format($q$INSERT INTO inspections(shipment_id, assigned_to, assigned_by) VALUES (%L,%L,%L)$q$, v_ship, pg_temp.uid('sinta@ayvora.local'), pg_temp.uid('manager@ayvora.local')), 'uq_inspection_active_shipment');
    UPDATE inspections SET status='Under Inspection' WHERE id=v_ins;
    PERFORM pg_temp.expect_error('Tidak Ditemukan tanpa catatan ditolak',
        format($q$UPDATE inspections SET status='Not Found' WHERE id=%L$q$, v_ins), 'Catatan');
    UPDATE inspections SET status='Not Found', not_found_note='Barang tidak ada di area bongkar.' WHERE id=v_ins;
    INSERT INTO inspections(shipment_id, assigned_to, assigned_by) VALUES (v_ship, pg_temp.uid('sinta@ayvora.local'), pg_temp.uid('manager@ayvora.local')) RETURNING id INTO v_ins2;
    PERFORM pg_temp.check_that('Setelah Tidak Ditemukan, Manager bisa memerintahkan ulang', v_ins2 IS NOT NULL);

    UPDATE inspections SET status='Under Inspection' WHERE id=v_ins2;
    INSERT INTO inspection_items(inspection_id,product_id,ordered_qty,received_qty,good_qty,damaged_qty,rack_id,note)
    VALUES (v_ins2, pg_temp.pid('AYV-CAR-003'), 50, 40, 40, 0, pg_temp.rid('C-01'), '10 yang datang Food Box');
    PERFORM pg_temp.expect_error('Produk salah tanpa foto ditolak',
        format($q$INSERT INTO inspection_mismatches(inspection_id,expected_product_id,actual_product_id,quantity,note) VALUES (%L,%L,%L,10,'salah')$q$, v_ins2, pg_temp.pid('AYV-CAR-003'), pg_temp.pid('AYV-CAR-005')), 'photo_url');
    INSERT INTO inspection_mismatches(inspection_id,expected_product_id,actual_product_id,quantity,note,photo_url)
    VALUES (v_ins2, pg_temp.pid('AYV-CAR-003'), pg_temp.pid('AYV-CAR-005'), 12, 'salah', '/w.png');
    PERFORM pg_temp.expect_error('Jumlah produk salah > jumlah kurang ditolak saat kirim',
        format($q$UPDATE inspections SET status='Inspection Completed' WHERE id=%L$q$, v_ins2), 'melebihi jumlah kurang');
    UPDATE inspection_mismatches SET quantity = 10 WHERE inspection_id = v_ins2;
    UPDATE inspections SET status='Inspection Completed' WHERE id=v_ins2;
    UPDATE inspections SET approval_status='Approved', approved_by=pg_temp.uid('manager@ayvora.local') WHERE id=v_ins2;
    PERFORM pg_temp.check_that('Produk salah: 1 klaim Wrong Item, tanpa klaim kurang ganda',
        (SELECT COUNT(*) FROM claims WHERE inspection_id=v_ins2) = 1
        AND EXISTS (SELECT 1 FROM claims WHERE inspection_id=v_ins2 AND claim_type='Wrong Item' AND quantity=10));
    PERFORM pg_temp.check_that('Produk salah tidak masuk stok (Food Box tidak bertambah dari pemeriksaan ini)',
        NOT EXISTS (SELECT 1 FROM stock_movements WHERE inspection_id=v_ins2 AND product_id = pg_temp.pid('AYV-CAR-005')));
END $$;

-- ---------- E. KLAIM: PENGGANTI & REFUND ----------
DO $$
DECLARE v_claim claims%ROWTYPE; v_ship UUID; v_ins UUID; v_before BIGINT;
BEGIN
    SELECT * INTO v_claim FROM claims WHERE claim_type = 'Shortage' AND status = 'Claim Submitted' AND quantity = 4;
    v_before := pg_temp.phys('AYV-CAR-002');
    PERFORM pg_temp.expect_error('Status Replacement In Transit tanpa pengiriman ditolak',
        format($q$UPDATE claims SET status='Replacement In Transit' WHERE id=%L$q$, v_claim.id), 'pengiriman barang pengganti');
    INSERT INTO inbound_shipments(kind, restock_order_id, claim_id, shipped_by) VALUES ('Replacement', v_claim.restock_order_id, v_claim.id, pg_temp.uid('andi@ecopack.local')) RETURNING id INTO v_ship;
    PERFORM pg_temp.check_that('Pengganti: klaim Replacement In Transit, isi = sisa klaim, bukan PO baru',
        (SELECT status FROM claims WHERE id=v_claim.id) = 'Replacement In Transit'
        AND (SELECT quantity FROM inbound_shipment_items WHERE shipment_id=v_ship) = 4
        AND (SELECT restock_order_id FROM inbound_shipments WHERE id=v_ship) = v_claim.restock_order_id);
    PERFORM pg_temp.expect_error('Pengiriman pengganti tanpa klaim ditolak',
        format($q$INSERT INTO inbound_shipments(kind, restock_order_id, shipped_by) VALUES ('Replacement',%L,%L)$q$, v_claim.restock_order_id, pg_temp.uid('andi@ecopack.local')), 'menunjuk klaim');
    UPDATE inbound_shipments SET status='Arrived', arrival_photo_url='/x.png', arrived_by=pg_temp.uid('andi@ecopack.local') WHERE id=v_ship;
    INSERT INTO inspections(shipment_id, assigned_to, assigned_by) VALUES (v_ship, pg_temp.uid('staff@ayvora.local'), pg_temp.uid('manager@ayvora.local')) RETURNING id INTO v_ins;
    UPDATE inspections SET status='Under Inspection' WHERE id=v_ins;
    INSERT INTO inspection_items(inspection_id,product_id,ordered_qty,received_qty,good_qty,damaged_qty,rack_id,note,photo_url)
    VALUES (v_ins, v_claim.product_id, 4, 4, 3, 1, pg_temp.rid('C-01'), '1 rusak lagi', '/r.png');
    UPDATE inspections SET status='Inspection Completed' WHERE id=v_ins;
    UPDATE inspections SET approval_status='Approved', approved_by=pg_temp.uid('manager@ayvora.local') WHERE id=v_ins;
    PERFORM pg_temp.check_that('Pengganti disetujui: stok +3 bersumber klaim',
        pg_temp.phys('AYV-CAR-002') = v_before + 3
        AND EXISTS (SELECT 1 FROM stock_movements WHERE inspection_id=v_ins AND claim_id=v_claim.id AND quantity_change=3));
    PERFORM pg_temp.check_that('Pengganti bermasalah lagi: sisa 1 tetap di klaim yang sama (Claim Submitted), tanpa klaim baru',
        (SELECT status = 'Claim Submitted' AND resolved_quantity = 3 FROM claims WHERE id=v_claim.id)
        AND NOT EXISTS (SELECT 1 FROM claims WHERE inspection_id = v_ins));

    -- Sisa diselesaikan lewat refund
    PERFORM pg_temp.expect_error('Refund tanpa bukti ditolak',
        format($q$UPDATE claims SET status='Refund Processing', refund_amount=1000 WHERE id=%L$q$, v_claim.id), 'chk_claim_refund');
    UPDATE claims SET status='Refund Processing', refund_amount=1000, refund_proof_url='/p.png' WHERE id=v_claim.id;
    UPDATE claims SET refund_proof_invalid=TRUE, refund_rejection_reason='Nominal tidak terbaca' WHERE id=v_claim.id;
    PERFORM pg_temp.expect_error('Bukti refund tidak valid tidak bisa langsung Resolved',
        format($q$UPDATE claims SET status='Resolved', resolved_by=%L WHERE id=%L$q$, pg_temp.uid('manager@ayvora.local'), v_claim.id), 'tidak valid');
    UPDATE claims SET refund_proof_url='/p2.png', refund_proof_invalid=FALSE WHERE id=v_claim.id;
    v_before := pg_temp.phys('AYV-CAR-002');
    PERFORM pg_temp.expect_error('Supplier tidak bisa menutup klaim',
        format($q$UPDATE claims SET status='Resolved', resolved_by=%L WHERE id=%L$q$, pg_temp.uid('andi@ecopack.local'), v_claim.id), 'Warehouse Manager');
    UPDATE claims SET status='Resolved', resolved_by=pg_temp.uid('manager@ayvora.local') WHERE id=v_claim.id;
    PERFORM pg_temp.check_that('Refund Resolved, stok tidak berubah', (SELECT status FROM claims WHERE id=v_claim.id) = 'Resolved' AND pg_temp.phys('AYV-CAR-002') = v_before);
    PERFORM pg_temp.expect_error('Klaim Resolved tidak bisa dibuka lagi',
        format($q$UPDATE claims SET status='Claim Submitted' WHERE id=%L$q$, v_claim.id), 'tidak diizinkan');
END $$;

-- Sanggahan klaim
DO $$
DECLARE v_claim UUID;
BEGIN
    SELECT id INTO v_claim FROM claims WHERE claim_type = 'Wrong Item' AND status = 'Claim Submitted' LIMIT 1;
    PERFORM pg_temp.expect_error('Sanggah tanpa alasan ditolak', format($q$UPDATE claims SET status='Disputed' WHERE id=%L$q$, v_claim), 'chk_claim_dispute');
    UPDATE claims SET status='Disputed', dispute_reason='Barang sudah sesuai surat jalan' WHERE id=v_claim;
    PERFORM pg_temp.expect_error('Tolak sanggahan wajib alasan', format($q$UPDATE claims SET status='Claim Submitted' WHERE id=%L$q$, v_claim), 'sanggahan');
    UPDATE claims SET status='Claim Submitted', dispute_decision_note='Foto staff menunjukkan produk berbeda' WHERE id=v_claim;
    UPDATE claims SET status='Disputed', dispute_reason='Sanggah ulang' WHERE id=v_claim;
    UPDATE claims SET status='Claim Rejected', resolved_by=pg_temp.uid('manager@ayvora.local'), resolution_note='Sanggahan diterima' WHERE id=v_claim;
    PERFORM pg_temp.check_that('Sanggahan diterima: Claim Rejected', (SELECT status = 'Claim Rejected' AND resolution = 'Rejected' FROM claims WHERE id=v_claim));
END $$;

-- ---------- F. BARANG KELUAR ----------
DO $$
DECLARE v_a UUID; v_b UUID; v_before BIGINT; v_events INT;
BEGIN
    v_before := pg_temp.phys('AYV-BAG-005');   -- 200
    INSERT INTO outbound_orders(customer_name,destination_address,contact_phone,created_by) VALUES ('Cust A','Jl. A','0811',pg_temp.uid('staff@ayvora.local')) RETURNING id INTO v_a;
    INSERT INTO outbound_order_items(order_id,product_id,requested_qty) VALUES (v_a, pg_temp.pid('AYV-BAG-005'), 150);
    INSERT INTO outbound_orders(customer_name,destination_address,contact_phone,created_by) VALUES ('Cust B','Jl. B','0812',pg_temp.uid('sinta@ayvora.local')) RETURNING id INTO v_b;
    INSERT INTO outbound_order_items(order_id,product_id,requested_qty) VALUES (v_b, pg_temp.pid('AYV-BAG-005'), 120);
    PERFORM pg_temp.check_that('Pending Approval: stok fisik & tersedia tidak berubah', pg_temp.phys('AYV-BAG-005') = v_before AND pg_temp.avail('AYV-BAG-005') = v_before);

    PERFORM pg_temp.expect_error('Laporan keluar oleh Manager ditolak',
        format($q$INSERT INTO outbound_orders(customer_name,destination_address,contact_phone,created_by) VALUES ('X','Y','1',%L)$q$, pg_temp.uid('manager@ayvora.local')), 'Staff Gudang');
    PERFORM pg_temp.expect_error('Staff tidak bisa menyetujui',
        format($q$UPDATE outbound_order_items SET approved_qty=150 WHERE order_id=%1$L; UPDATE outbound_orders SET status='Approved', decided_by=%2$L WHERE id=%1$L$q$, v_a, pg_temp.uid('staff@ayvora.local')), 'Warehouse Manager');
    PERFORM pg_temp.expect_error('Siapkan sebelum Approved ditolak',
        format($q$UPDATE outbound_orders SET status='Preparing', prepared_by=%L WHERE id=%L$q$, pg_temp.uid('staff@ayvora.local'), v_a), 'tidak diizinkan');

    UPDATE outbound_order_items SET approved_qty = 150 WHERE order_id = v_a;
    UPDATE outbound_orders SET status='Approved', decided_by=pg_temp.uid('manager@ayvora.local') WHERE id=v_a;
    PERFORM pg_temp.check_that('Approved: alokasi +150, stok fisik tetap', pg_temp.phys('AYV-BAG-005') = v_before AND pg_temp.avail('AYV-BAG-005') = v_before - 150);

    PERFORM pg_temp.expect_error('Laporan kedua melebihi Stok Tersedia ditolak',
        format($q$UPDATE outbound_order_items SET approved_qty=120 WHERE order_id=%1$L; UPDATE outbound_orders SET status='Approved', decided_by=%2$L WHERE id=%1$L$q$, v_b, pg_temp.uid('manager@ayvora.local')), 'melebihi Stok Tersedia');
    UPDATE outbound_order_items SET approved_qty = 50 WHERE order_id = v_b;
    UPDATE outbound_orders SET status='Approved', decided_by=pg_temp.uid('manager@ayvora.local') WHERE id=v_b;
    PERFORM pg_temp.check_that('Disetujui sebagian sebesar stok yang ada (50 dari 120), tersedia jadi 0', pg_temp.avail('AYV-BAG-005') = 0);
    PERFORM pg_temp.expect_error('Persetujuan kedua tidak diizinkan',
        format($q$UPDATE outbound_order_items SET approved_qty=40 WHERE order_id=%L$q$, v_b), 'setelah persetujuan');

    UPDATE outbound_orders SET status='Preparing', prepared_by=pg_temp.uid('sinta@ayvora.local') WHERE id=v_a;
    PERFORM pg_temp.check_that('Preparing: alokasi tetap aktif, stok fisik tetap', pg_temp.phys('AYV-BAG-005') = v_before AND pg_temp.avail('AYV-BAG-005') = 0);
    UPDATE outbound_order_items SET rack_id = pg_temp.rid('B-01'), shipped_qty = 140 WHERE order_id = v_a;
    PERFORM pg_temp.expect_error('Kirim kurang dari alokasi tanpa catatan ditolak',
        format($q$UPDATE outbound_orders SET status='Shipped', shipped_by=%L WHERE id=%L$q$, pg_temp.uid('staff@ayvora.local'), v_a), 'Catatan wajib');
    PERFORM pg_temp.expect_error('Jumlah dikirim melebihi alokasi ditolak',
        format($q$UPDATE outbound_order_items SET shipped_qty=151 WHERE order_id=%L$q$, v_a), 'check constraint');
    UPDATE outbound_orders SET status='Shipped', shipped_by=pg_temp.uid('staff@ayvora.local'), ship_note='10 pcs cacat saat dikemas' WHERE id=v_a;
    PERFORM pg_temp.check_that('Shipped: stok fisik -140 (jumlah aktual), sisa alokasi dilepas',
        pg_temp.phys('AYV-BAG-005') = v_before - 140 AND pg_temp.avail('AYV-BAG-005') = v_before - 140 - 50);
    PERFORM pg_temp.check_that('Stock movement OUTGOING -140 tercatat', (SELECT COUNT(*) FROM stock_movements WHERE outbound_order_id=v_a AND quantity_change=-140) = 1);
    PERFORM pg_temp.expect_error('Shipped adalah status akhir (kirim ganda ditolak)',
        format($q$UPDATE outbound_orders SET status='Preparing' WHERE id=%L$q$, v_a), 'tidak diizinkan');

    PERFORM pg_temp.expect_error('Batal tanpa alasan ditolak',
        format($q$UPDATE outbound_orders SET status='Cancelled', cancelled_by=%L WHERE id=%L$q$, pg_temp.uid('manager@ayvora.local'), v_b), 'Alasan pembatalan');
    UPDATE outbound_orders SET status='Cancelled', cancelled_by=pg_temp.uid('manager@ayvora.local'), cancel_reason='Pelanggan membatalkan' WHERE id=v_b;
    PERFORM pg_temp.check_that('Cancelled: alokasi dilepas, stok fisik tetap', pg_temp.avail('AYV-BAG-005') = v_before - 140);
    SELECT COUNT(*) INTO v_events FROM outbound_order_events WHERE order_id = v_a;
    PERFORM pg_temp.check_that('Riwayat barang keluar bernomor (4 langkah)', v_events = 4, v_events::TEXT);
END $$;

-- Penolakan & pengajuan ulang, stok 0 tidak bisa disetujui
DO $$
DECLARE v_o UUID;
BEGIN
    INSERT INTO outbound_orders(customer_name,destination_address,contact_phone,created_by) VALUES ('Cust C','Jl. C','0813',pg_temp.uid('staff@ayvora.local')) RETURNING id INTO v_o;
    INSERT INTO outbound_order_items(order_id,product_id,requested_qty) VALUES (v_o, pg_temp.pid('AYV-CAR-004'), 10);
    PERFORM pg_temp.expect_error('Produk dengan Stok Tersedia 0 tidak bisa disetujui',
        format($q$UPDATE outbound_order_items SET approved_qty=10 WHERE order_id=%1$L; UPDATE outbound_orders SET status='Approved', decided_by=%2$L WHERE id=%1$L$q$, v_o, pg_temp.uid('manager@ayvora.local')), 'kosong');
    PERFORM pg_temp.expect_error('Tolak tanpa alasan ditolak',
        format($q$UPDATE outbound_orders SET status='Rejected', decided_by=%L WHERE id=%L$q$, pg_temp.uid('manager@ayvora.local'), v_o), 'Alasan penolakan');
    UPDATE outbound_orders SET status='Rejected', decided_by=pg_temp.uid('manager@ayvora.local'), rejection_reason='Stok kosong' WHERE id=v_o;
    DELETE FROM outbound_order_items WHERE order_id = v_o;
    INSERT INTO outbound_order_items(order_id,product_id,requested_qty) VALUES (v_o, pg_temp.pid('AYV-CAR-005'), 10);
    UPDATE outbound_orders SET status='Pending Approval', updated_by=pg_temp.uid('sinta@ayvora.local') WHERE id=v_o;
    PERFORM pg_temp.check_that('Pengajuan ulang oleh Staff lain: pengajuan ke-2, alasan lama tetap di riwayat',
        (SELECT submission_count FROM outbound_orders WHERE id=v_o) = 2
        AND EXISTS (SELECT 1 FROM outbound_order_events WHERE order_id=v_o AND note LIKE 'Ditolak: Stok kosong%'));
END $$;

-- ---------- G. PRODUK & PENGGUNA ----------
SELECT pg_temp.expect_error('Produk pada barang keluar aktif tidak bisa diarsipkan',
    $q$UPDATE products SET is_active = FALSE WHERE sku = 'AYV-CAR-005'$q$, 'barang keluar');
SELECT pg_temp.expect_error('Produk di PO berjalan tidak bisa diarsipkan',
    $q$UPDATE products SET is_active = FALSE WHERE sku = 'AYV-CAR-001'$q$, 'PO yang berjalan');
DO $$
BEGIN
    UPDATE users SET is_active = FALSE WHERE email = 'sinta@ayvora.local';
    PERFORM pg_temp.expect_error('Staff nonaktif tidak bisa ditugaskan',
        format($q$UPDATE inspections SET assigned_to=%L WHERE status='Awaiting Inspection'$q$, pg_temp.uid('sinta@ayvora.local')), 'aktif');
END $$;

-- ---------- H. KETERLAMBATAN ----------
SELECT pg_temp.check_that('PO Confirmed belum dikirim & lewat estimasi terdeteksi', (SELECT COUNT(*) FROM v_restock_overview WHERE is_late) >= 1);
CREATE TEMP TABLE late_run AS SELECT detect_late_restocks() AS first_run;
SELECT pg_temp.check_that('detect_late_restocks membuat notifikasi', (SELECT first_run FROM late_run) >= 2, (SELECT first_run::TEXT FROM late_run));
SELECT pg_temp.check_that('detect_late_restocks idempoten', detect_late_restocks() = 0);

-- ---------- H2. HAPUS PO / BARANG KELUAR, KATEGORI, TANGGAL ----------
DO $$
DECLARE v_po UUID; v_out UUID; v_pending UUID;
BEGIN
    INSERT INTO restock_orders(supplier_id, created_by, expected_delivery_date)
    VALUES (pg_temp.uid('andi@ecopack.local'), pg_temp.uid('manager@ayvora.local'), today_local() + 5) RETURNING id INTO v_pending;
    INSERT INTO restock_order_items(restock_order_id, product_id, quantity, unit_price) VALUES (v_pending, pg_temp.pid((SELECT sku FROM products LIMIT 1)), 5, 1000);
    PERFORM pg_temp.check_that('tanggal order PO terisi hari ini (WITA)', (SELECT order_date = today_local() FROM restock_orders WHERE id = v_pending));
    PERFORM pg_temp.check_that('nomor PO otomatis', (SELECT po_number ~ '^PO-[0-9]{8}-' FROM restock_orders WHERE id = v_pending));
    UPDATE restock_orders SET status = 'Confirmed' WHERE id = v_pending;
    PERFORM pg_temp.expect_error('PO Confirmed tidak bisa dihapus', format('DELETE FROM restock_orders WHERE id=%L', v_pending), 'Pending');
    INSERT INTO restock_orders(supplier_id, created_by, expected_delivery_date)
    VALUES (pg_temp.uid('andi@ecopack.local'), pg_temp.uid('manager@ayvora.local'), today_local() + 5) RETURNING id INTO v_po;
    DELETE FROM restock_orders WHERE id = v_po;
    PERFORM pg_temp.check_that('PO Pending bisa dihapus', NOT EXISTS (SELECT 1 FROM restock_orders WHERE id = v_po));

    INSERT INTO outbound_orders(customer_name, destination_address, contact_phone, created_by)
    VALUES ('Kafe', 'Jl. A', '08', pg_temp.uid('staff@ayvora.local')) RETURNING id INTO v_out;
    DELETE FROM outbound_orders WHERE id = v_out;
    PERFORM pg_temp.check_that('barang keluar Pending Approval bisa dihapus', NOT EXISTS (SELECT 1 FROM outbound_orders WHERE id = v_out));
    PERFORM pg_temp.expect_error('barang keluar Approved tidak bisa dihapus',
        format($q$DELETE FROM outbound_orders WHERE status <> 'Pending Approval' AND id = %L$q$, (SELECT id FROM outbound_orders WHERE status = 'Approved' LIMIT 1))::TEXT, 'Pending Approval');
END $$;
SELECT pg_temp.expect_error('nama kategori kembar (beda huruf) ditolak',
    $q$INSERT INTO categories(name, description) VALUES (LOWER((SELECT name FROM categories LIMIT 1)), 'x')$q$, 'duplicate');

-- ---------- I. INTEGRITAS AKHIR ----------
SELECT pg_temp.check_that('stok tiap rak tetap = jumlah stock_movements setelah semua uji',
    NOT EXISTS (
        SELECT 1 FROM product_locations pl
        WHERE pl.quantity <> COALESCE((SELECT SUM(quantity_change) FROM stock_movements sm
                                       WHERE sm.product_id = pl.product_id AND sm.rack_id = pl.rack_id), 0)));

-- ---------- LAPORAN ----------
SELECT no, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS hasil, name, CASE WHEN ok THEN '' ELSE info END AS info FROM test_results ORDER BY no;
SELECT COUNT(*) FILTER (WHERE ok) AS lulus, COUNT(*) FILTER (WHERE NOT ok) AS gagal FROM test_results;

ROLLBACK;
