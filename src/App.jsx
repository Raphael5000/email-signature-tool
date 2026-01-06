import React, { useState, useRef, useEffect } from 'react'
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
} from '../components/navigation-menu'
import { Button } from '../components/button'
import { Textarea } from '../components/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '../components/card'
import { Label } from '../components/label'
import { Menu, X } from 'lucide-react'

function App() {
  const [signatureHtml, setSignatureHtml] = useState('')
  const [detectedFields, setDetectedFields] = useState([])
  const [originalHtml, setOriginalHtml] = useState('')
  const [outputHtml, setOutputHtml] = useState('')
  const [detectStatus, setDetectStatus] = useState('')
  const [noFieldsMsg, setNoFieldsMsg] = useState('')
  const [fieldValues, setFieldValues] = useState({})
  const [isGenerateDisabled, setIsGenerateDisabled] = useState(true)
  const [isCopyDisabled, setIsCopyDisabled] = useState(true)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const previewFrameRef = useRef(null)

  const resetUI = () => {
    setDetectedFields([])
    setDetectStatus('')
    setOutputHtml('')
    setNoFieldsMsg('')
    setFieldValues({})
    setIsGenerateDisabled(true)
    setIsCopyDisabled(true)
    updatePreview('')
  }

  const handleClear = () => {
    setSignatureHtml('')
    resetUI()
  }

  const escapeHtml = (str) => {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  }

  const getTextNodes = (node) => {
    const textNodes = []
    function walk(n) {
      if (n.nodeType === Node.TEXT_NODE) {
        textNodes.push(n)
      } else {
        n.childNodes.forEach(walk)
      }
    }
    walk(node)
    return textNodes
  }

  const detectFieldsFromHtml = (html) => {
    const fields = []

    // 1) Email
    const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
    const emailMatch = html.match(emailRegex)
    if (emailMatch) {
      fields.push({
        key: "email",
        label: "Email",
        originalValue: emailMatch[0],
        suggestedValue: emailMatch[0]
      })
    }

    // 2) Phone number (very loose pattern)
    const phoneRegex = /(\+?\d[\d\s().-]{7,}\d)/
    const phoneMatch = html.match(phoneRegex)
    if (phoneMatch) {
      fields.push({
        key: "phone",
        label: "Phone",
        originalValue: phoneMatch[0].trim(),
        suggestedValue: phoneMatch[0].trim()
      })
    }

    // 3) Parse as HTML to get text nodes
    const wrapperHtml = "<div>" + html + "</div>"
    let textNodes = []
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(wrapperHtml, "text/html")
      textNodes = getTextNodes(doc.body)
        .map((n) => n.nodeValue.trim())
        .filter((t) => t.length > 0)
    } catch (e) {
      // Fallback: simple split on tags
      textNodes = html
        .replace(/<[^>]+>/g, " ")
        .split(/\s{2,}/)
        .map((t) => t.trim())
        .filter((t) => t)
    }

    // Remove email & phone from text candidates
    const cleaned = textNodes.filter((t) => {
      return !emailRegex.test(t) && !phoneRegex.test(t)
    })

    // If placeholders exist, prioritise those
    const PLACEHOLDER_NAME = "Full name"
    const PLACEHOLDER_TITLE = "This is a title"

    if (html.includes(PLACEHOLDER_NAME)) {
      fields.push({
        key: "fullName",
        label: "Full name",
        originalValue: PLACEHOLDER_NAME,
        suggestedValue: ""
      })
    }

    if (html.includes(PLACEHOLDER_TITLE)) {
      fields.push({
        key: "title",
        label: "Job title",
        originalValue: PLACEHOLDER_TITLE,
        suggestedValue: ""
      })
    }

    // Fallback: first 1–2 non-empty text nodes as name/title
    if (!fields.some((f) => f.key === "fullName") && cleaned[0]) {
      fields.push({
        key: "fullName",
        label: "Full name",
        originalValue: cleaned[0],
        suggestedValue: cleaned[0]
      })
    }
    if (!fields.some((f) => f.key === "title") && cleaned[1]) {
      fields.push({
        key: "title",
        label: "Job title",
        originalValue: cleaned[1],
        suggestedValue: cleaned[1]
      })
    }

    // Deduplicate by originalValue
    const seen = new Set()
    return fields.filter((f) => {
      if (!f.originalValue) return false
      const key = f.label + "::" + f.originalValue
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  const handleDetect = () => {
    const html = signatureHtml.trim()
    resetUI()

    if (!html) {
      setDetectStatus("<strong>Nothing to scan.</strong> Paste your signature HTML first.")
      return
    }

    setOriginalHtml(html)
    const fields = detectFieldsFromHtml(html)
    setDetectedFields(fields)
    
    // Initialize field values
    const initialValues = {}
    fields.forEach(field => {
      initialValues[field.key] = field.suggestedValue || field.originalValue || ""
    })
    setFieldValues(initialValues)

    if (fields.length === 0) {
      setDetectStatus("<strong>No obvious fields found.</strong> You can still manually replace values later by editing the HTML.")
      setNoFieldsMsg("Tip: Use clear placeholder text like 'Full name', 'Job title', etc. for easier detection.")
    } else {
      setDetectStatus(`<strong>Found ${fields.length} field(s).</strong> Edit the values below, then click Generate.`)
      setIsGenerateDisabled(false)
    }
  }

  const handleFieldChange = (key, value) => {
    setFieldValues(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const handleGenerate = () => {
    if (!originalHtml) return

    let updatedHtml = originalHtml

    // Replace field values
    detectedFields.forEach((field) => {
      const newValue = fieldValues[field.key] || field.originalValue
      if (!field.originalValue) return
      updatedHtml = updatedHtml.split(field.originalValue).join(newValue)
    })

    setOutputHtml(updatedHtml)
    setIsCopyDisabled(!updatedHtml.trim())
    updatePreview(updatedHtml)
  }

  const handleCopy = async () => {
    if (!outputHtml) return

    const html = outputHtml

    // Try to use Clipboard API with text/html for rich paste
    if (navigator.clipboard && window.ClipboardItem) {
      try {
        const blob = new Blob([html], { type: "text/html" })
        const data = [new ClipboardItem({ "text/html": blob })]
        await navigator.clipboard.write(data)
        // You could add a toast notification here
        return
      } catch (err) {
        console.warn("Rich clipboard failed, falling back to text-only copy.", err)
      }
    }

    // Fallback: select the textarea and copy as text
    const textarea = document.getElementById("outputHtml")
    if (textarea) {
      textarea.focus()
      textarea.select()
      try {
        document.execCommand("copy")
      } catch (err) {
        console.error("Copy failed", err)
      } finally {
        window.getSelection().removeAllRanges()
      }
    }
  }

  const updatePreview = (html) => {
    if (!previewFrameRef.current) return
    
    const doc = previewFrameRef.current.contentDocument || previewFrameRef.current.contentWindow.document
    doc.open()
    if (!html) {
      doc.write("<!doctype html><html><head><meta charset='utf-8'></head><body style='font-family:system-ui; font-size:12px; color:#9ca3af; display:flex; align-items:center; justify-content:center; height:120px;'>Signature preview will appear here after you generate it.</body></html>")
    } else {
      doc.write(
        "<!doctype html><html><head><meta charset='utf-8'></head><body>" +
        html +
        "</body></html>"
      )
    }
    doc.close()

    // Adjust iframe height to content (roughly)
    setTimeout(() => {
      try {
        const body = doc.body
        const height = body.scrollHeight || 150
        previewFrameRef.current.style.height = Math.min(Math.max(height, 150), 400) + "px"
      } catch (e) {
        // ignore
      }
    }, 50)
  }

  useEffect(() => {
    updatePreview("")
  }, [])

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <header className="relative flex h-[68px] items-center justify-between px-6 bg-white border-b border-gray-200">
        <img 
          className="h-9 w-auto" 
          src="https://cdn.prod.website-files.com/6826f1bc2fc92556aa2497cc/69392412e6b34a38bb174dc6_Signature%20Tool%20Logo.png" 
          alt="Signature Tool logo" 
        />
        
        {/* Desktop Navigation */}
        <NavigationMenu className="hidden md:flex ml-16">
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuLink 
                href="#" 
                className="group inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
              >
                Editor
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink 
                href="#" 
                disabled
                className="group inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50"
                style={{ opacity: 0.5 }}
              >
                Generator
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        {/* Mobile Hamburger Button */}
        <button
          className="md:hidden p-2 rounded-md hover:bg-gray-100 transition-colors"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <Menu className="h-6 w-6" />
          )}
        </button>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="absolute top-full left-0 right-0 bg-white border-b border-gray-200 shadow-lg md:hidden z-50">
            <nav className="flex flex-col py-2">
              <a
                href="#"
                className="px-6 py-3 text-sm font-medium text-gray-900 hover:bg-gray-100 transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Editor
              </a>
              <a
                href="#"
                className="px-6 py-3 text-sm font-medium text-gray-500 opacity-50 cursor-not-allowed"
                onClick={(e) => e.preventDefault()}
              >
                Generator
              </a>
            </nav>
          </div>
        )}
      </header>

      <div className="max-w-5xl mx-auto mt-6 p-5 sm:p-6">
        <Card className="shadow-lg">
          <CardContent className="pt-6">
            <div className="mb-6">
              <div className="hivory-h5 mb-2">1. Paste your HTML signature</div>
              <Label htmlFor="signatureInput" className="hivory-paragraph-small font-semibold block mb-1">
                Signature HTML
              </Label>
              <Textarea 
                id="signatureInput"
                value={signatureHtml}
                onChange={(e) => setSignatureHtml(e.target.value)}
                className="w-full min-h-[160px] font-mono text-sm resize-y" 
                placeholder="Paste your HTML email signature here..."
              />

              <div className="flex flex-wrap gap-2 mt-3">
                <Button 
                  onClick={handleDetect}
                  className="rounded-full"
                >
                  Find fields
                </Button>
                <Button 
                  onClick={handleClear}
                  variant="outline"
                  className="rounded-full"
                  type="button"
                >
                  Clear
                </Button>
              </div>
              {detectStatus && (
                <div 
                  className="hivory-paragraph-small text-gray-500 mt-2"
                  dangerouslySetInnerHTML={{ __html: detectStatus }}
                />
              )}
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-between gap-2">
                <div className="hivory-h5 flex items-center">
                  2. Edit the detected fields
                  <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 uppercase tracking-[0.03em] ml-1">
                    Auto-detected
                  </span>
                </div>
                <span className="hivory-paragraph-small text-gray-500">
                  You can change the values before generating.
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                {detectedFields.map((field) => (
                  <Card key={field.key} className="bg-gray-50">
                    <CardContent className="p-3 space-y-1">
                      <Label className="block text-xs text-gray-500">{field.label}</Label>
                      <input 
                        type="text" 
                        value={fieldValues[field.key] || ''}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        className="w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                      />
                      <small className="block text-xs text-gray-500">
                        Original: <code className="font-mono text-[11px]">{escapeHtml(field.originalValue || "")}</code>
                      </small>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {noFieldsMsg && (
                <div className="hivory-paragraph-small text-gray-500 mt-1">{noFieldsMsg}</div>
              )}
            </div>

            <div className="mb-2">
              <div className="hivory-h5 mb-2">3. Generate and preview updated signature</div>
              <div className="flex flex-wrap gap-2">
                <Button 
                  onClick={handleGenerate}
                  disabled={isGenerateDisabled}
                  className="rounded-full"
                >
                  Generate
                </Button>
                <Button 
                  onClick={handleCopy}
                  disabled={isCopyDisabled}
                  variant="outline"
                  className="rounded-full"
                  type="button"
                >
                  Copy signature
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-4 mt-4">
                <div className="min-w-0">
                  <Label htmlFor="outputHtml" className="hivory-paragraph-small font-semibold block mb-1">
                    Updated HTML
                  </Label>
                  <Textarea 
                    id="outputHtml"
                    value={outputHtml}
                    readOnly
                    className="w-full min-h-[160px] font-mono text-sm resize-y" 
                    placeholder="Your updated HTML will appear here..."
                  />
                  <div className="hivory-paragraph-small text-gray-500 mt-1">
                    Copy this HTML or use the button above to copy it with rich formatting.
                  </div>
                </div>

                <div className="min-w-0">
                  <Label className="hivory-paragraph-small font-semibold block mb-1">Preview</Label>
                  <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                    <iframe 
                      ref={previewFrameRef}
                      title="Signature preview" 
                      className="w-full border-0 bg-white min-h-[150px]"
                    />
                  </div>
                  <div className="hivory-paragraph-small text-gray-500 mt-1">
                    This is how your signature will look when pasted into your email client.
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default App
