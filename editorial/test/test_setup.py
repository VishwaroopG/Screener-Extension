import importlib.util
from pathlib import Path
import subprocess
import sys
import unittest

EDITORIAL = Path(__file__).parents[1]
sys.path.insert(0, str(EDITORIAL))
spec = importlib.util.spec_from_file_location('editorial_setup', EDITORIAL / 'setup.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class SetupEncodingTests(unittest.TestCase):
    def test_utf8_cli_output_decodes_on_windows(self):
        # UTF-8 bytes for Wrangler's cloud emoji include 0x8f, which CP1252
        # cannot decode. This reproduces the failure from the real setup window.
        output = setup.run([sys.executable, '-c',
                            "import sys; sys.stdout.buffer.write(bytes([0xe2,0x9b,0x85,0xef,0xb8,0x8f]))"])
        self.assertEqual(output, '\u26c5\ufe0f')

    def test_unexpected_cli_bytes_do_not_crash_reader_thread(self):
        output = setup.run([sys.executable, '-c', "import sys; sys.stdout.buffer.write(bytes([0xff]))"])
        self.assertEqual(output, '\ufffd')


if __name__ == '__main__':
    unittest.main()
