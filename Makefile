# Publish layout:
#   www/
#     +- index.html   (from src/index.html.tmpl via sed substitution)
#     +- app.js       (copied from src/app.js)
#     +- 2d/
#          +- *.svg   (copied from 2d/)
#
# Reference gh-pages flow: https://github.com/dynnamitt/hex-terrain/blob/main/Makefile

WWW     := www
SRC     := src
SVG_DIR := 2d
TITLE   := Square Body Projector

SVGS        := $(wildcard $(SVG_DIR)/*.svg)
OUT_SVGS    := $(SVGS:$(SVG_DIR)/%.svg=$(WWW)/$(SVG_DIR)/%.svg)
SVG_NAMES   := $(notdir $(SVGS))
SVG_OPTIONS := $(foreach s,$(SVG_NAMES),<option value="$(SVG_DIR)/$(s)">$(s)</option>)
JS_SRCS     := $(wildcard $(SRC)/*.js)
JS_OUT      := $(JS_SRCS:$(SRC)/%.js=$(WWW)/%.js)

.PHONY: build clean serve
build: $(WWW)/index.html $(JS_OUT) $(OUT_SVGS)

$(WWW)/index.html: $(SRC)/index.html.tmpl | $(WWW)
	sed -e 's|__TITLE__|$(TITLE)|g' \
	    -e "s|__BUILT__|$$(date -u +%FT%TZ)|g" \
	    -e 's|__SVG_OPTIONS__|$(SVG_OPTIONS)|g' \
	    $< > $@

$(WWW)/%.js: $(SRC)/%.js | $(WWW)
	cp $< $@

$(WWW)/$(SVG_DIR)/%.svg: $(SVG_DIR)/%.svg | $(WWW)/$(SVG_DIR)
	cp $< $@

$(WWW) $(WWW)/$(SVG_DIR):
	mkdir -p $@

clean:
	rm -rf $(WWW)

serve: build
	cd $(WWW) && python -m http.server 8080
