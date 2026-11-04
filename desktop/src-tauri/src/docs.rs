//! Resume / reference documents: pick a file, extract plain text locally (nothing is uploaded until
//! it's used as answer context).

use serde::Serialize;
use std::io::Read;
use std::path::Path;

const MAX_CHARS: usize = 20_000;

#[derive(Serialize)]
pub struct DocText {
    pub name: String,
    pub text: String,
    pub chars: usize,
    pub truncated: bool,
}

pub fn extract(path: &Path) -> Result<DocText, String> {
    let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "document".into());
    let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    let raw = match ext.as_str() {
        "pdf" => pdf_extract::extract_text(path).map_err(|e| format!("Couldn't read this PDF ({e}).")),
        "docx" => docx_text(path),
        "txt" | "md" | "markdown" | "csv" | "json" => std::fs::read(path)
            .map(|b| String::from_utf8_lossy(&b).to_string())
            .map_err(|e| e.to_string()),
        _ => Err("Use a PDF, DOCX, TXT or MD file.".into()),
    }?;
    let text = normalize(&raw);
    if text.chars().count() < 20 {
        return Err("No readable text found. Scanned PDFs (images) aren't supported yet.".into());
    }
    let truncated = text.chars().count() > MAX_CHARS;
    let text: String = text.chars().take(MAX_CHARS).collect();
    Ok(DocText { chars: text.chars().count(), name, text, truncated })
}

/// DOCX = zip containing word/document.xml. Paragraph ends become newlines, tags are dropped.
fn docx_text(path: &Path) -> Result<String, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| "This DOCX file looks damaged.".to_string())?;
    let mut xml = String::new();
    zip.by_name("word/document.xml")
        .map_err(|_| "This DOCX file has no document body.".to_string())?
        .read_to_string(&mut xml)
        .map_err(|e| e.to_string())?;
    let xml = xml.replace("</w:p>", "\n").replace("<w:tab/>", "\t").replace("<w:br/>", "\n");
    let mut out = String::with_capacity(xml.len() / 3);
    let mut in_tag = false;
    for c in xml.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    Ok(out
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'"))
}

/// Collapse runs of spaces and blank lines so the text costs fewer tokens.
fn normalize(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut blank = 0;
    for line in s.lines() {
        let line = line.split_whitespace().collect::<Vec<_>>().join(" ");
        if line.is_empty() {
            blank += 1;
            if blank == 1 && !out.is_empty() {
                out.push('\n');
            }
            continue;
        }
        blank = 0;
        out.push_str(&line);
        out.push('\n');
    }
    out.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_collapses_whitespace() {
        assert_eq!(normalize("a   b\n\n\n\nc  \n"), "a b\n\nc");
    }

    #[test]
    fn extracts_txt() {
        let p = std::env::temp_dir().join("glint-doc-test.txt");
        std::fs::write(&p, "Senior backend engineer.   Built payments APIs in Go.\n\n\nPython, Postgres").unwrap();
        let d = extract(&p).unwrap();
        assert_eq!(d.name, "glint-doc-test.txt");
        assert!(d.text.contains("Built payments APIs in Go."));
        assert!(!d.truncated);
    }
}
