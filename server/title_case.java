public class title_case {
    public static void main(String[]args)
    {
        String str="hello world";
        String[]words=str.trim().split(" ");
        for(int i=0;i<words.length;i++)
        {
            char ch=str.charAt(i);
            if(ch>'a'&&ch<'z')
            {
                ch=ch+32;
            }
            words[i]=ch;
            words[]=ch+words.substring(1);
        }
        for(int i=0;i<words.length;i++)
        {
            system.out.print(words[i]);
        }
    }
}


        

