package services

import (
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"wa-assistant/backend/database"
	"wa-assistant/backend/models"

	"golang.org/x/net/html"
)

// Konstanta crawler. Disengaja konservatif: hemat resource VPS & sopan ke situs target.
const (
	crawlUA         = "ChatLoopBot/1.0 (+https://chatloop.id; pelatihan AI customer service)"
	crawlTimeout    = 15 * time.Second
	crawlDelay      = 400 * time.Millisecond // jeda antar-halaman (politeness)
	maxPageBytes    = 3 << 20                // batas 3MB/halaman agar tidak boros memori
	maxSitemapDepth = 2                      // sitemap index boleh bersarang sampai 2 level
	chunkSize       = 800                    // ukuran chunk (rune) saat melatih
	chunkOverlap    = 100                    // tumpang-tindih antar-chunk agar konteks tak terpotong
)

var crawlClient = &http.Client{Timeout: crawlTimeout}

// RunCrawl menjalankan satu job crawl (dipanggil di goroutine oleh handler). Sitemap.xml dulu;
// kalau tidak ada, fallback BFS mengikuti link same-domain. Semua halaman disimpan ke CrawlPage.
func RunCrawl(jobID uint, maxPages int) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("Crawl job #%d panic: %v", jobID, r)
			finishCrawl(jobID, 0, fmt.Sprintf("panic: %v", r))
		}
	}()

	var job models.CrawlJob
	if database.DB.First(&job, jobID).Error != nil {
		return
	}
	database.DB.Model(&job).Update("status", "crawling")

	base, err := url.Parse(strings.TrimSpace(job.RootURL))
	if err != nil || (base.Scheme != "http" && base.Scheme != "https") || base.Host == "" {
		finishCrawl(jobID, 0, "URL tidak valid (harus diawali http:// atau https://)")
		return
	}
	host := canonicalHost(base.Host)
	database.DB.Model(&job).Update("domain", host)

	if maxPages <= 0 {
		maxPages = 50
	}
	disallow := loadRobotsDisallow(base)

	pages := 0
	savePage := func(pageURL, title, text string, ferr error) {
		p := models.CrawlPage{JobID: jobID, AgentID: job.AgentID, URL: pageURL, Title: title}
		if ferr != nil {
			p.Status, p.Error = "failed", ferr.Error()
		} else {
			p.Status, p.Content, p.CharCount = "crawled", text, len([]rune(text))
		}
		database.DB.Create(&p)
		pages++
	}

	// Jalur 1: sitemap.xml (lebih akurat & cepat).
	sitemap := fetchSitemapURLs(base, host)
	if len(sitemap) > 0 {
		for _, u := range sitemap {
			if pages >= maxPages {
				break
			}
			if pathDisallowed(u, disallow) {
				continue
			}
			title, text, _, ferr := fetchPage(u)
			savePage(u, title, text, ferr)
			time.Sleep(crawlDelay)
		}
		finishCrawl(jobID, pages, "")
		return
	}

	// Jalur 2: BFS dari root, ikuti link same-domain.
	visited := map[string]bool{}
	queue := []string{normalizeURL(job.RootURL)}
	for len(queue) > 0 && pages < maxPages {
		u := queue[0]
		queue = queue[1:]
		if u == "" || visited[u] {
			continue
		}
		visited[u] = true
		if pathDisallowed(u, disallow) {
			continue
		}
		title, text, links, ferr := fetchPage(u)
		savePage(u, title, text, ferr)
		time.Sleep(crawlDelay)
		if ferr != nil {
			continue
		}
		for _, l := range links {
			ln := normalizeURL(l)
			if ln != "" && canonicalHost(hostOf(ln)) == host && !visited[ln] {
				queue = append(queue, ln)
			}
		}
	}
	finishCrawl(jobID, pages, "")
}

func finishCrawl(jobID uint, pages int, errMsg string) {
	now := time.Now()
	status := "done"
	if errMsg != "" && pages == 0 {
		status = "failed"
	}
	database.DB.Model(&models.CrawlJob{}).Where("id = ?", jobID).Updates(map[string]any{
		"status": status, "pages_found": pages, "error": errMsg, "finished_at": &now,
	})
	log.Printf("Crawl job #%d selesai: %d halaman, status=%s %s", jobID, pages, status, errMsg)
}

// fetchPage mengambil satu halaman & mengembalikan judul, teks bersih, dan daftar link.
func fetchPage(rawurl string) (title, text string, links []string, err error) {
	req, err := http.NewRequest(http.MethodGet, rawurl, nil)
	if err != nil {
		return "", "", nil, err
	}
	req.Header.Set("User-Agent", crawlUA)
	resp, err := crawlClient.Do(req)
	if err != nil {
		return "", "", nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", "", nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "" && !strings.Contains(ct, "html") {
		return "", "", nil, fmt.Errorf("bukan halaman HTML (%s)", ct)
	}
	doc, err := html.Parse(io.LimitReader(resp.Body, maxPageBytes))
	if err != nil {
		return "", "", nil, err
	}
	base, _ := url.Parse(rawurl)
	title, text = extractTitleText(doc)
	links = extractLinks(doc, base)
	return title, text, links, nil
}

// extractTitleText menelusuri pohon HTML, mencari heading artikel dulu (h1/h2/h3 yang cocok
// dengan <title>), lalu ambil teks dari parent container-nya. Fallback ke container konten
// (<article>, <main>, WordPress content classes), atau seluruh teks terlihat.
func extractTitleText(root *html.Node) (title, text string) {
	// Cari <title> dulu
	title = findTitle(root)

	// Phase 1: cari heading artikel (h1/h2/h3) yang teksnya mirip title
	articleContainer := findArticleContainer(root, title)

	// Phase 2: kalau nemu, ekstrak dari container itu. Kalau tidak, coba findContentRoot.
	// Kalau tetap tidak nemu, fallback ke seluruh root.
	source := articleContainer
	if source == nil {
		source = findContentRoot(root)
	}
	if source == nil {
		source = root
	}

	_, text = extractTextFrom(source)
	return title, collapseSpaces(text)
}

// findTitle mencari teks dari tag <title>.
func findTitle(n *html.Node) string {
	var title string
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if title != "" {
			return
		}
		if n.Type == html.ElementNode && n.Data == "title" && n.FirstChild != nil {
			title = strings.TrimSpace(n.FirstChild.Data)
			return
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	return title
}

// findArticleContainer mencari heading artikel (h1/h2/h3) yang teksnya mengandung
// kata kunci dari title, lalu naik ke parent container (max 5 level) yang cukup besar.
func findArticleContainer(n *html.Node, title string) *html.Node {
	if title == "" {
		return nil
	}
	titleWords := strings.Fields(strings.ToLower(title))

	var result *html.Node
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if result != nil {
			return
		}
		if n.Type == html.ElementNode && (n.Data == "h1" || n.Data == "h2" || n.Data == "h3") {
			headingText := strings.ToLower(extractTextOnly(n))
			// Cek minimal 2 kata dari title muncul di heading
			match := 0
			for _, w := range titleWords {
				if len(w) >= 4 && strings.Contains(headingText, w) {
					match++
				}
			}
			if match >= 2 || strings.Contains(headingText, strings.ToLower(title[:min(30, len(title))])) {
				// Naik ke parent container (max 5 level, cari yang punya banyak teks)
				candidate := n
				for i := 0; i < 5 && candidate != nil; i++ {
					candidate = candidate.Parent
					if candidate != nil && len(extractTextOnly(candidate)) > 200 {
						result = candidate
						return
					}
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	return result
}

// extractTextOnly mengambil teks dari node TANPA title (hanya text nodes langsung).
func extractTextOnly(n *html.Node) string {
	var sb strings.Builder
	var walk func(*html.Node, bool)
	walk = func(n *html.Node, skip bool) {
		if n.Type == html.ElementNode {
			switch n.Data {
			case "script", "style", "noscript", "svg":
				skip = true
			}
		}
		if n.Type == html.TextNode && !skip {
			sb.WriteString(strings.TrimSpace(n.Data))
			sb.WriteByte(' ')
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c, skip)
		}
	}
	walk(n, false)
	return strings.TrimSpace(sb.String())
}

// findContentRoot mencari node <article>, <main>, atau element dengan class/role konten.
// Mengembalikan nil jika tidak ditemukan.
func findContentRoot(n *html.Node) *html.Node {
	var result *html.Node
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if result != nil {
			return
		}
		if n.Type == html.ElementNode {
			switch n.Data {
			case "article", "main":
				result = n
				return
			}
			// Deteksi WordPress/situs umum: class/id mengandung keyword konten
			for _, a := range n.Attr {
				if a.Key == "class" || a.Key == "id" {
					lower := strings.ToLower(a.Val)
					for _, kw := range []string{
						"post-content", "entry-content", "article-content", "content-area",
						"the-content", "site-content", "post-body", "article-body",
					} {
						if strings.Contains(lower, kw) {
							result = n
							return
						}
					}
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	return result
}

// extractTextFrom mengambil semua teks terlihat dari node,
// melewati element non-konten (script, style, nav, footer, aside, header, head).
func extractTextFrom(n *html.Node) (title, text string) {
	var sb strings.Builder
	var walk func(n *html.Node, skip bool)
	walk = func(n *html.Node, skip bool) {
		if n.Type == html.ElementNode {
			switch n.Data {
			case "script", "style", "noscript", "svg", "head", "nav", "footer", "aside", "header":
				skip = true
			case "title":
				if title == "" && n.FirstChild != nil && n.FirstChild.Type == html.TextNode {
					title = strings.TrimSpace(n.FirstChild.Data)
				}
			}
		}
		if n.Type == html.TextNode && !skip {
			if t := strings.TrimSpace(n.Data); t != "" {
				sb.WriteString(t)
				sb.WriteByte(' ')
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c, skip)
		}
	}
	// Kalau cuma ekstrak dari container, tetap cari title dari root via parameter
	walk(n, false)
	return title, sb.String()
}

// extractLinks mengumpulkan seluruh href <a>, di-resolve relatif terhadap base.
func extractLinks(root *html.Node, base *url.URL) []string {
	var out []string
	var walk func(n *html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == "a" {
			for _, a := range n.Attr {
				if a.Key == "href" {
					if u, err := base.Parse(strings.TrimSpace(a.Val)); err == nil {
						out = append(out, u.String())
					}
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(root)
	return out
}

// --- Sitemap ---

type sitemapDoc struct {
	URLs     []sitemapLoc `xml:"url"`
	Sitemaps []sitemapLoc `xml:"sitemap"`
}
type sitemapLoc struct {
	Loc string `xml:"loc"`
}

// fetchSitemapURLs membaca /sitemap.xml (mendukung sitemap index bersarang) & mengembalikan
// daftar URL same-domain (sudah dedup). Kosong bila tidak ada sitemap.
func fetchSitemapURLs(base *url.URL, host string) []string {
	smURL := base.Scheme + "://" + base.Host + "/sitemap.xml"
	seen := map[string]bool{}
	var out []string
	collect := func(u string) {
		n := normalizeURL(u)
		if n != "" && canonicalHost(hostOf(n)) == host && !seen[n] {
			seen[n] = true
			out = append(out, n)
		}
	}
	fetchSitemapRecursive(smURL, collect, 0)
	return out
}

func fetchSitemapRecursive(smURL string, collect func(string), depth int) {
	if depth > maxSitemapDepth {
		return
	}
	req, err := http.NewRequest(http.MethodGet, smURL, nil)
	if err != nil {
		return
	}
	req.Header.Set("User-Agent", crawlUA)
	resp, err := crawlClient.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return
	}
	defer resp.Body.Close()
	var doc sitemapDoc
	if xml.NewDecoder(io.LimitReader(resp.Body, maxPageBytes)).Decode(&doc) != nil {
		return
	}
	for _, u := range doc.URLs {
		if loc := strings.TrimSpace(u.Loc); loc != "" {
			collect(loc)
		}
	}
	for _, s := range doc.Sitemaps {
		if loc := strings.TrimSpace(s.Loc); loc != "" {
			fetchSitemapRecursive(loc, collect, depth+1)
		}
	}
}

// --- robots.txt (minimal) ---

// loadRobotsDisallow mengambil aturan Disallow untuk User-agent: * (best-effort, sopan).
func loadRobotsDisallow(base *url.URL) []string {
	req, err := http.NewRequest(http.MethodGet, base.Scheme+"://"+base.Host+"/robots.txt", nil)
	if err != nil {
		return nil
	}
	req.Header.Set("User-Agent", crawlUA)
	resp, err := crawlClient.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return nil
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 256<<10))
	return parseRobots(string(body))
}

// parseRobots mengambil path Disallow yang berlaku untuk semua bot (User-agent: *).
func parseRobots(body string) []string {
	var disallow []string
	applies := false
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, val, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		key = strings.ToLower(strings.TrimSpace(key))
		val = strings.TrimSpace(val)
		switch key {
		case "user-agent":
			applies = val == "*"
		case "disallow":
			if applies && val != "" {
				disallow = append(disallow, val)
			}
		}
	}
	return disallow
}

func pathDisallowed(rawurl string, disallow []string) bool {
	if len(disallow) == 0 {
		return false
	}
	u, err := url.Parse(rawurl)
	if err != nil {
		return false
	}
	for _, d := range disallow {
		if d != "" && strings.HasPrefix(u.Path, d) {
			return true
		}
	}
	return false
}

// --- helper URL & teks ---

// normalizeURL membuang fragment & query, hanya izinkan http/https, agar dedup konsisten.
func normalizeURL(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return ""
	}
	u.Fragment = ""
	u.RawQuery = ""
	s := u.String()
	return strings.TrimSuffix(s, "/")
}

func hostOf(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return u.Host
}

// canonicalHost menyeragamkan host (buang "www." dan port) supaya www & non-www dianggap sama.
func canonicalHost(h string) string {
	h = strings.ToLower(h)
	if i := strings.IndexByte(h, ':'); i >= 0 {
		h = h[:i]
	}
	return strings.TrimPrefix(h, "www.")
}

// collapseSpaces merapatkan semua whitespace beruntun jadi satu spasi.
func collapseSpaces(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

// ChunkText memecah teks jadi potongan ~chunkSize rune dengan tumpang-tindih, untuk di-embed.
func ChunkText(text string) []string {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	runes := []rune(text)
	if len(runes) <= chunkSize {
		return []string{text}
	}
	var chunks []string
	for start := 0; start < len(runes); {
		end := start + chunkSize
		if end > len(runes) {
			end = len(runes)
		}
		if c := strings.TrimSpace(string(runes[start:end])); c != "" {
			chunks = append(chunks, c)
		}
		if end == len(runes) {
			break
		}
		start = end - chunkOverlap
	}
	return chunks
}
