<?php
use PHPUnit\Framework\TestCase;
use Envkey\Fetcher;
use Envkey\Loader;

class EnvkeyTest extends TestCase
{
    private static $VALID_ENVKEY = 'ekAc8p6PiPp1Di7nQu5vGomx-qXknocWWVYqyVMaxaBco12';
    private static $INVALID_ENVKEY = 'ekunDrefdPeELwPpupdzJpsz-2Hs3HCiscoY1TfGinvalid';
    private static $INVALID_ENVKEY2 = 'ekunDrefdPeELwPpuinvalid-2Hs3HCiscoY1TfGcVdefum';
    private static $INVALID_ENVKEY3 = 'invalid';

    protected function setUp(): void
    {
        $this->clearEnv();
    }

    protected function tearDown(): void
    {
        $this->clearEnv();
    }

    private function clearEnv()
    {
        putenv('ENVKEY');
        putenv('TEST');
        putenv('TEST_2');
    }

    public function testLoadAndDecryptEnvironment()
    {        
        putenv('ENVKEY=' . self::$VALID_ENVKEY);
        \Envkey\Loader::load();
        $this->assertEquals('it', getenv('TEST'));
        $this->assertEquals('works!', getenv('TEST_2'));
    }

    public function testRaiseErrorWithInvalidEnvKey()
    {        
        $invalidKeys = [self::$INVALID_ENVKEY, self::$INVALID_ENVKEY2, self::$INVALID_ENVKEY3];

        foreach ($invalidKeys as $invalidKey) {
            putenv('ENVKEY=' . $invalidKey);
            $this->expectException(Exception::class);
            $this->expectExceptionMessage("ENVKEY invalid. Couldn't load vars.");
            \Envkey\Loader::load();
        }
    }

    public function testNotOverwriteExistingEnvironmentVariables()
    {      
        putenv('ENVKEY=' . self::$VALID_ENVKEY);
        putenv('TEST=otherthing');
        \Envkey\Loader::load();
        $this->assertEquals('otherthing', getenv('TEST'));
        $this->assertEquals('works!', getenv('TEST_2'));
    }

    public function testNotOverwriteExistingEnvironmentVariablesWithFalsyValue()
    {      
        putenv('ENVKEY=' . self::$VALID_ENVKEY);
        putenv('TEST=');
        \Envkey\Loader::load();
        $this->assertEquals('', getenv('TEST'));
        $this->assertEquals('works!', getenv('TEST_2'));
    }
}