using System;

namespace Sample;

public class Program
{
    #region sample_hello_world
    public static void Main()
    {
        Console.WriteLine("Hello, World!");
    }
    #endregion

    #region sample_nested_regions
    public void Outer()
    {
        #region sample_inner
        Console.WriteLine("Inner");
        #endregion

        Console.WriteLine("After inner");
    }
    #endregion

    #region not_a_sample
    public void Skipped()
    {
        // This region does NOT start with sample_
    }
    #endregion

    #region sample_indented
        public void IndentedMethod()
        {
            var x = 42;
            Console.WriteLine(x);
        }
    #endregion
}
