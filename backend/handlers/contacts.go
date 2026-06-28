package handlers

import (
	"sort"
	"strconv"
	"strings"
	"time"

	"wa-assistant/backend/database"
	"wa-assistant/backend/models"
	"wa-assistant/backend/services"

	"github.com/gin-gonic/gin"
)

// normalizeTags merapikan daftar tag: trim, buang kosong & duplikat, gabung dengan koma.
func normalizeTags(raw string) string {
	seen := map[string]bool{}
	out := make([]string, 0)
	for _, t := range strings.Split(raw, ",") {
		t = strings.TrimSpace(t)
		if t == "" {
			continue
		}
		key := strings.ToLower(t)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, t)
	}
	return strings.Join(out, ",")
}

// tagList memecah string tag tersimpan jadi slice (sudah ter-trim, tanpa kosong).
func tagList(s string) []string {
	out := make([]string, 0)
	for _, t := range strings.Split(s, ",") {
		if t = strings.TrimSpace(t); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// ListSavedContacts = buku kontak tersimpan (CRM ringan): cari, filter tag, paginasi,
// plus waktu chat terakhir tiap kontak. ?all=1 mengembalikan semua hasil tanpa paginasi
// (dipakai untuk menjadikan satu tag jadi target broadcast).
func ListSavedContacts(c *gin.Context) {
	id, ok := resolveAgent(c)
	if !ok {
		return
	}
	q := strings.ToLower(strings.TrimSpace(c.Query("q")))
	tag := strings.ToLower(strings.TrimSpace(c.Query("tag")))
	all := c.Query("all") == "1"
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	const limit = 20

	var contacts []models.Contact
	database.DB.Where("agent_id = ?", id).Order("name asc, number asc").Find(&contacts)

	// Waktu chat terakhir per nomor (satu query, dikelompokkan).
	type lastRow struct {
		Sender string
		Last   time.Time
	}
	var rows []lastRow
	database.DB.Model(&models.ChatHistory{}).
		Select("sender, MAX(created_at) as last").
		Where("agent_id = ?", id).Group("sender").Scan(&rows)
	lastAt := make(map[string]time.Time, len(rows))
	for _, r := range rows {
		lastAt[r.Sender] = r.Last
	}

	tagSet := map[string]string{} // lower -> bentuk tampil
	filtered := make([]models.Contact, 0, len(contacts))
	for _, ct := range contacts {
		tags := tagList(ct.Tags)
		for _, t := range tags {
			tagSet[strings.ToLower(t)] = t
		}
		if q != "" && !strings.Contains(strings.ToLower(ct.Name), q) && !strings.Contains(ct.Number, q) {
			continue
		}
		if tag != "" {
			has := false
			for _, t := range tags {
				if strings.ToLower(t) == tag {
					has = true
					break
				}
			}
			if !has {
				continue
			}
		}
		filtered = append(filtered, ct)
	}

	total := len(filtered)
	pageItems := filtered
	if !all {
		start := (page - 1) * limit
		if start > total {
			start = total
		}
		end := start + limit
		if end > total {
			end = total
		}
		pageItems = filtered[start:end]
	}

	data := make([]gin.H, 0, len(pageItems))
	for _, ct := range pageItems {
		var la interface{}
		if t, ok := lastAt[ct.Number]; ok && !t.IsZero() {
			la = t
		}
		data = append(data, gin.H{
			"id": ct.ID, "number": ct.Number, "name": ct.Name,
			"notes": ct.Notes, "tags": ct.Tags, "last_at": la,
		})
	}

	allTags := make([]string, 0, len(tagSet))
	for _, disp := range tagSet {
		allTags = append(allTags, disp)
	}
	sort.Slice(allTags, func(i, j int) bool { return strings.ToLower(allTags[i]) < strings.ToLower(allTags[j]) })

	c.JSON(200, gin.H{"data": data, "total": total, "page": page, "limit": limit, "all_tags": allTags})
}

func CreateSavedContact(c *gin.Context) {
	id, ok := resolveAgent(c)
	if !ok {
		return
	}
	var req struct {
		Number string `json:"number"`
		Name   string `json:"name"`
		Notes  string `json:"notes"`
		Tags   string `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Format data tidak valid"})
		return
	}
	num := services.NormalizePhone(req.Number)
	if num == "" {
		c.JSON(400, gin.H{"error": "Nomor wajib diisi"})
		return
	}
	var existing models.Contact
	if database.DB.Where("agent_id = ? AND number = ?", id, num).First(&existing).Error == nil {
		c.JSON(409, gin.H{"error": "Nomor ini sudah ada di kontak"})
		return
	}
	ct := models.Contact{AgentID: id, Number: num, Name: strings.TrimSpace(req.Name), Notes: req.Notes, Tags: normalizeTags(req.Tags)}
	if err := database.DB.Create(&ct).Error; err != nil { c.JSON(500, gin.H{"error": "Gagal"}); return }
	c.JSON(201, gin.H{"data": ct})
}

// UpdateSavedContact mengubah nama/catatan/tag. Nomor sengaja tidak bisa diubah
// (jadi kunci unik & terikat riwayat chat) — kalau salah, hapus lalu tambah ulang.
func UpdateSavedContact(c *gin.Context) {
	id, ok := resolveAgent(c)
	if !ok {
		return
	}
	var ct models.Contact
	if database.DB.Where("agent_id = ?", id).First(&ct, c.Param("cid")).Error != nil {
		c.JSON(404, gin.H{"error": "Kontak tidak ditemukan"})
		return
	}
	var req struct {
		Name  *string `json:"name"`
		Notes *string `json:"notes"`
		Tags  *string `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Format data tidak valid"})
		return
	}
	if req.Name != nil {
		ct.Name = strings.TrimSpace(*req.Name)
	}
	if req.Notes != nil {
		ct.Notes = *req.Notes
	}
	if req.Tags != nil {
		ct.Tags = normalizeTags(*req.Tags)
	}
	_ = database.DB.Save(&ct).Error
	c.JSON(200, gin.H{"data": ct})
}

func DeleteSavedContact(c *gin.Context) {
	id, ok := resolveAgent(c)
	if !ok {
		return
	}
	_ = database.DB.Where("agent_id = ?", id).Delete(&models.Contact{}, c.Param("cid")).Error
	c.JSON(200, gin.H{"message": "Deleted"})
}

// BulkTagSavedContacts menambahkan tag ke beberapa kontak sekaligus.
// Body: { ids: number[], tag: string }. Tag baru ditambahkan (append)
// tanpa menghapus tag yang sudah ada. Duplikat otomatis dibuang.
func BulkTagSavedContacts(c *gin.Context) {
	id, ok := resolveAgent(c)
	if !ok {
		return
	}
	var req struct {
		IDs []uint `json:"ids"`
		Tag string `json:"tag"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Format data tidak valid"})
		return
	}
	tag := strings.TrimSpace(req.Tag)
	if tag == "" {
		c.JSON(400, gin.H{"error": "Tag wajib diisi"})
		return
	}
	if len(req.IDs) == 0 {
		c.JSON(400, gin.H{"error": "Pilih minimal satu kontak"})
		return
	}

	var contacts []models.Contact
	database.DB.Where("agent_id = ? AND id IN ?", id, req.IDs).Find(&contacts)
	if len(contacts) == 0 {
		c.JSON(404, gin.H{"error": "Kontak tidak ditemukan"})
		return
	}

	updated := 0
	for _, ct := range contacts {
		existing := tagList(ct.Tags)
		lowerTag := strings.ToLower(tag)
		already := false
		for _, t := range existing {
			if strings.ToLower(t) == lowerTag {
				already = true
				break
			}
		}
		if already {
			continue
		}
		existing = append(existing, tag)
		ct.Tags = normalizeTags(strings.Join(existing, ","))
		_ = database.DB.Save(&ct).Error
		updated++
	}

	c.JSON(200, gin.H{"message": "Tag ditambahkan", "updated": updated, "total": len(contacts)})
}

// ImportSavedContacts memasukkan banyak kontak sekaligus dari berbagai sumber
// (input manual, nomor terkoneksi, atau unggahan CSV). Body:
//
//	{ contacts: [{number, name}], tag?: string }
//
// Nomor yang sudah ada dilewati (tidak menimpa nama/tag lama). Jika `tag` diisi,
// tag itu dipasang ke semua kontak baru yang berhasil dibuat.
func ImportSavedContacts(c *gin.Context) {
	id, ok := resolveAgent(c)
	if !ok {
		return
	}
	var req struct {
		Contacts []struct {
			Number string `json:"number"`
			Name   string `json:"name"`
		} `json:"contacts"`
		Tag string `json:"tag"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Format data tidak valid"})
		return
	}
	if len(req.Contacts) == 0 {
		c.JSON(400, gin.H{"error": "Tidak ada kontak untuk diimpor"})
		return
	}

	// Nomor yang sudah tersimpan, supaya tidak dobel.
	var existing []models.Contact
	database.DB.Where("agent_id = ?", id).Find(&existing)
	have := make(map[string]bool, len(existing))
	for _, ct := range existing {
		have[ct.Number] = true
	}

	tag := normalizeTags(req.Tag)
	fresh := make([]models.Contact, 0, len(req.Contacts))
	imported, skipped := 0, 0
	for _, r := range req.Contacts {
		num := services.NormalizePhone(r.Number)
		if num == "" {
			skipped++
			continue
		}
		if have[num] {
			skipped++
			continue
		}
		have[num] = true // cegah duplikat di dalam batch yang sama
		fresh = append(fresh, models.Contact{
			AgentID: id, Number: num, Name: strings.TrimSpace(r.Name), Tags: tag,
		})
		imported++
	}

	if len(fresh) > 0 {
		if err := database.DB.CreateInBatches(fresh, 200).Error; err != nil {
			c.JSON(500, gin.H{"error": "Gagal menyimpan kontak"})
			return
		}
	}
	c.JSON(200, gin.H{"message": "Impor selesai", "imported": imported, "skipped": skipped})
}

// BulkDeleteSavedContacts menghapus banyak kontak sekaligus. Body:
//
//	{ ids: number[] }              -> hapus kontak terpilih
//	{ all: true, q?, tag? }        -> hapus SEMUA kontak yang cocok filter (atau semua)
//
// Mode `all` mengikuti filter pencarian/tag yang sedang aktif di UI, jadi user bisa
// "hapus semua hasil pencarian ini" tanpa harus mencentang satu per satu.
func BulkDeleteSavedContacts(c *gin.Context) {
	id, ok := resolveAgent(c)
	if !ok {
		return
	}
	var req struct {
		IDs []uint `json:"ids"`
		All bool   `json:"all"`
		Q   string `json:"q"`
		Tag string `json:"tag"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Format data tidak valid"})
		return
	}

	if !req.All {
		if len(req.IDs) == 0 {
			c.JSON(400, gin.H{"error": "Pilih minimal satu kontak"})
			return
		}
		res := database.DB.Where("agent_id = ? AND id IN ?", id, req.IDs).Delete(&models.Contact{})
		if res.Error != nil {
			c.JSON(500, gin.H{"error": "Gagal menghapus kontak"})
			return
		}
		c.JSON(200, gin.H{"message": "Kontak dihapus", "deleted": res.RowsAffected})
		return
	}

	// Mode "hapus semua sesuai filter". Tanpa filter = kosongkan buku kontak.
	q := strings.ToLower(strings.TrimSpace(req.Q))
	tag := strings.ToLower(strings.TrimSpace(req.Tag))
	if q == "" && tag == "" {
		res := database.DB.Where("agent_id = ?", id).Delete(&models.Contact{})
		if res.Error != nil {
			c.JSON(500, gin.H{"error": "Gagal menghapus kontak"})
			return
		}
		c.JSON(200, gin.H{"message": "Semua kontak dihapus", "deleted": res.RowsAffected})
		return
	}

	// Ada filter: cari id yang cocok dulu (tag disimpan sebagai string koma, jadi
	// difilter di Go agar cocok per-tag persis, bukan substring).
	var contacts []models.Contact
	database.DB.Where("agent_id = ?", id).Find(&contacts)
	ids := make([]uint, 0)
	for _, ct := range contacts {
		if q != "" && !strings.Contains(strings.ToLower(ct.Name), q) && !strings.Contains(ct.Number, q) {
			continue
		}
		if tag != "" {
			has := false
			for _, t := range tagList(ct.Tags) {
				if strings.ToLower(t) == tag {
					has = true
					break
				}
			}
			if !has {
				continue
			}
		}
		ids = append(ids, ct.ID)
	}
	if len(ids) == 0 {
		c.JSON(200, gin.H{"message": "Tidak ada kontak yang cocok", "deleted": 0})
		return
	}
	res := database.DB.Where("agent_id = ? AND id IN ?", id, ids).Delete(&models.Contact{})
	if res.Error != nil {
		c.JSON(500, gin.H{"error": "Gagal menghapus kontak"})
		return
	}
	c.JSON(200, gin.H{"message": "Kontak dihapus", "deleted": res.RowsAffected})
}
