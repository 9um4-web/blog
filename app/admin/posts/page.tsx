import Link from "next/link";
import { PostDeleteButton } from "@/components/admin/post-delete-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSiteSettings, listPostsForAdmin } from "@/lib/db/queries";
import { formatDateTimeShort } from "@/lib/format-date";

export const metadata = { title: "포스트 관리" };

export default async function AdminPostsPage() {
  const [posts, { timeZone }] = await Promise.all([listPostsForAdmin(), getSiteSettings()]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">포스트</h1>
        <Button asChild>
          <Link href="/admin/posts/new">새 포스트</Link>
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>제목</TableHead>
            <TableHead>슬러그</TableHead>
            <TableHead>수정일</TableHead>
            <TableHead>상태</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {posts.map((post) => (
            <TableRow key={post.id}>
              <TableCell>
                <Link href={`/admin/posts/${post.id}`} className="font-medium hover:underline">
                  {post.title}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{post.slug}</TableCell>
              <TableCell className="text-muted-foreground">
                {formatDateTimeShort(post.updatedAt, timeZone)}
              </TableCell>
              <TableCell>
                {post.parseError ? (
                  <Badge variant="destructive">파싱 실패</Badge>
                ) : (
                  <Badge variant="secondary">정상</Badge>
                )}
              </TableCell>
              <TableCell>
                <PostDeleteButton postId={post.id} title={post.title} />
              </TableCell>
            </TableRow>
          ))}
          {posts.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                포스트가 없습니다.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
