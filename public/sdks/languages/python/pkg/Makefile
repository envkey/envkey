build: clean
	python3 setup.py bdist_wheel

clean:
	-rm -rf build
	-rm -rf dist

release: build
	twine upload dist/*

test:
	pip3 install -e .
	pytest